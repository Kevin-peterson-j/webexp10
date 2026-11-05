
const http = require("http");
const fs = require("fs");
const path = require("path");
const { MongoClient } = require("mongodb");

// MongoDB configuration
const url = "mongodb://127.0.0.1:27017";
const client = new MongoClient(url);

const DATABASE = "experiment10";
const COLLECTION = "registrations";
const PORT = 6001;

let registrations;

// Escape user input before displaying it in HTML.
function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (char) {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[char];
    });
}

// Send an HTML response.
function sendHTML(res, statusCode, html) {
    res.writeHead(statusCode, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff"
    });

    res.end(html);
}

// Read submitted form data.
function readRequestBody(req) {
    return new Promise((resolve, reject) => {
        let rawData = "";
        let tooLarge = false;

        req.on("data", chunk => {
            rawData += chunk.toString();

            if (rawData.length > 10000) {
                tooLarge = true;
                reject(new Error("Form data is too large."));
                req.destroy();
            }
        });

        req.on("end", () => {
            if (!tooLarge) {
                resolve(rawData);
            }
        });

        req.on("error", reject);
    });
}

// Validate the form on the server as well.
function validateForm(data) {
    const allowedStates = [
        "Andhra Pradesh",
        "Karnataka",
        "Kerala",
        "Tamil Nadu",
        "Telangana",
        "Maharashtra",
        "Delhi"
    ];

    const allowedSkills = [
        "Java Script",
        "Python",
        "C++",
        "Java"
    ];

    const name = data.get("name")?.trim() || "";
    const password = data.get("password") || "";
    const ageText = data.get("age") || "";
    const mobile = data.get("mobile") || "";
    const email = data.get("email")?.trim() || "";
    const gender = data.get("gender") || "";
    const state = data.get("state") || "";
    const skills = data.getAll("skills");

    const age = Number(ageText);

    if (name.length < 2 || name.length > 60) {
        return "Name must contain 2 to 60 characters.";
    }

    if (password.length < 6 || password.length > 72) {
        return "Password must contain 6 to 72 characters.";
    }

    if (
        !/^\d+$/.test(ageText) ||
        !Number.isInteger(age) ||
        age < 1 ||
        age > 120
    ) {
        return "Enter a valid age between 1 and 120.";
    }

    if (!/^\d{10}$/.test(mobile)) {
        return "Enter a valid 10-digit mobile number.";
    }

    if (
        email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
        return "Enter a valid email address.";
    }

    if (!["Male", "Female"].includes(gender)) {
        return "Select a valid gender.";
    }

    if (!allowedStates.includes(state)) {
        return "Select a valid state.";
    }

    if (
        skills.length === 0 ||
        skills.some(skill => !allowedSkills.includes(skill)) ||
        new Set(skills).size !== skills.length
    ) {
        return "Select at least one valid skill.";
    }

    return null;
}

// Build the submitted-details table.
function createResultPage(record) {
    const rows = [
        ["Name", record.name],
        ["Password", record.password],
        ["Age", record.age],
        ["Mobile Number", record.mobile],
        ["Email", record.email],
        ["Gender", record.gender],
        ["State", record.state],
        ["Skills", record.skills.join(", ")]
    ];

    const tableRows = rows.map(([label, value]) => `
        <tr>
            <td>${escapeHTML(label)}</td>
            <td>${escapeHTML(value)}</td>
        </tr>
    `).join("");

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>User Submitted Details</title>
        <style>
            body {
                font-family: Arial, sans-serif;
                padding: 30px 15px;
                color: blue;
            }

            h1 {
                text-align: center;
                text-decoration: underline;
                font-size: 26px;
            }

            table {
                width: 100%;
                max-width: 600px;
                margin: 25px auto;
                border-collapse: collapse;
            }

            td {
                border: 1px solid #aaa;
                padding: 12px;
                overflow-wrap: anywhere;
            }

            td:first-child {
                width: 40%;
            }

            .actions {
                text-align: center;
                margin: 20px;
            }

            a {
                margin: 0 10px;
            }
        </style>
    </head>
    <body>
        <h1>User Submitted Details</h1>

        <table>
            ${tableRows}
        </table>

        <div class="actions">
            <a href="/">Register Another User</a>
        </div>
    </body>
    </html>
    `;
}

// Create the HTTP server.
const server = http.createServer(async (req, res) => {
    try {
        const pathname = new URL(
            req.url,
            `http://${req.headers.host || "localhost"}`
        ).pathname;

        // Display the home page.
        if (pathname === "/" && req.method === "GET") {
            const filePath = path.join(__dirname, "home.html");
            const html = fs.readFileSync(filePath, "utf8");

            return sendHTML(res, 200, html);
        }

        // Process the registration form.
        if (pathname === "/server" && req.method === "POST") {
            const contentType = req.headers["content-type"] || "";

            if (!contentType.includes("application/x-www-form-urlencoded")) {
                return sendHTML(res, 415, "<h1>Unsupported form type</h1>");
            }

            const rawData = await readRequestBody(req);
            const data = new URLSearchParams(rawData);

            const validationError = validateForm(data);

            if (validationError) {
                return sendHTML(
                    res,
                    400,
                    `<h2>Registration Error</h2>
                     <p>${escapeHTML(validationError)}</p>
                     <a href="/">Go Back</a>`
                );
            }

            const record = {
                name: data.get("name").trim(),
                password: data.get("password"),
                age: Number(data.get("age")),
                mobile: data.get("mobile"),
                email: data.get("email").trim(),
                gender: data.get("gender"),
                state: data.get("state"),
                skills: data.getAll("skills"),
                createdAt: new Date()
            };

            // Insert the form data into MongoDB.
            const result = await registrations.insertOne(record);

            // Retrieve the inserted record from MongoDB.
            const savedRecord = await registrations.findOne({
                _id: result.insertedId
            });

            if (!savedRecord) {
                throw new Error("Unable to retrieve saved registration.");
            }

            // Display the saved record in table format.
            return sendHTML(res, 200, createResultPage(savedRecord));
        }

        // Handle unknown routes.
        return sendHTML(res, 404, "<h1>404 - Page Not Found</h1>");

    } catch (error) {
        console.error("Request error:", error.message);

        if (!res.headersSent && !res.destroyed) {
            sendHTML(
                res,
                500,
                `<h1>Server Error</h1>
                 <p>Unable to process the request. Check the server terminal.</p>
                 <a href="/">Return Home</a>`
            );
        }
    }
});

// Connect to MongoDB before accepting requests.
async function startServer() {
    try {
        await client.connect();

        const db = client.db(DATABASE);
        registrations = db.collection(COLLECTION);

        console.log("Connected to MongoDB successfully.");

        server.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("MongoDB connection failed:", error.message);
        process.exitCode = 1;
    }
}

startServer();

// Close connections cleanly when stopping the application.
async function shutdown() {
    server.close();
    await client.close();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
