#!/bin/sh
set -e
cd "$(dirname "$0")/.."
mkdir -p build
swiftc -O -o build/wanwu-auth scripts/auth.swift
codesign -s - --force build/wanwu-auth
