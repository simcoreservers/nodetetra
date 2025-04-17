#!/bin/bash
# Script to remove the duplicate auto-dosing directory

# Check if directory exists
if [ -d "src/app/api/auto-dosing" ]; then
  echo "Removing duplicate directory: src/app/api/auto-dosing"
  rm -rf src/app/api/auto-dosing
  echo "Directory removed successfully"
else
  echo "Directory src/app/api/auto-dosing not found, no action needed"
fi

echo "Fix completed"
