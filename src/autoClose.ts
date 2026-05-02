// Standalone CLI entrypoint for the auto-close sweep — used by `npm run auto-close`
// outside of a GitHub Action context. The reusable sweep itself lives in autoCloseRunner.ts.
require("dotenv").config();
import { runAutoCloseSweep } from "./autoCloseRunner";

const log = {
    info: (msg: any) => console.log(typeof msg === "string" ? msg : JSON.stringify(msg)),
    error: (msg: any) => console.error(typeof msg === "string" ? msg : JSON.stringify(msg)),
};

runAutoCloseSweep(log).then(
    () => process.exit(0),
    (err) => {
        console.error("Fatal:", err);
        process.exit(1);
    },
);
