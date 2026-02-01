import "dotenv/config";
import express from "express";
import payload from "payload"

const port = Number(process.argv[2]) || 3000;

const main = async () => {
    const app = express();

    await payload.init({
        config: {
            secret: process.env["PAYLOAD_SECRET"]!,
        },
        express: app,
    });

    app.listen(port, () => {
        payload.logger.info(`Admin: ${payload.getAdminURL()}`);
        payload.logger.info(`Listening on http://localhost:${port}`);
    });
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
});