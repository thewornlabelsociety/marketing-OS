#!/usr/bin/env node
'use strict';
/**
 * PG-1 — Supabase Postgres Foundation verification runner
 * Run: npm run verify:pg-1
 */
require('dotenv/config');
require('ts-node/register/transpile-only');
require('./verify-pg-1.ts');
