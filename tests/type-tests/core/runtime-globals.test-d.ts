import { expectError, expectType } from "tsd";

// globals.d.ts describes what the CLI's embedded runtime provides to a configuration
// file: `process.env` and nothing else from Node's process object.
expectType<string | undefined>(process.env.HOME);
expectType<string | undefined>(process.env["MOCK_SERVER_PORT"]);

const token: string = process.env.GITHUB_TOKEN || "";
expectType<string>(token);

expectError(process.platform);
expectError(process.argv);
