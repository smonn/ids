import * as fc from "fast-check";

const seed = process.env["FC_SEED"] ? Number(process.env["FC_SEED"]) : 42;
fc.configureGlobal({ seed });
