#!/usr/bin/env node
import { run } from "./lib/worldgen-switch.mjs";

process.exitCode = await run(process.argv.slice(2), process.env);
