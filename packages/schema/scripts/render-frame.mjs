#!/usr/bin/env node
// stdin: TSX component source  ->  stdout: sandbox HTML (same builder the web app uses)
import { buildAnimationFrameHtml } from "../src/animation-frame.mjs";

const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const source = Buffer.concat(chunks).toString("utf8");
const reducedMotion = process.argv.includes("--rm");
process.stdout.write(buildAnimationFrameHtml(source, { reducedMotion, playing: true }));
