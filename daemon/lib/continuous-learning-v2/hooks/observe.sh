#!/usr/bin/env bash
# Nokta Continuous Learning v2 Observe Hook
# Called by Claude Code before/after tool use to capture observations

echo "CLV2 hook triggered" >> /tmp/clv2-hook.log 2>/dev/null || true

# Signal to parent process that a tool was used
# This hook runs as a command hook in Claude Code settings
exit 0