#!/bin/sh
# Regenerates the .gst/.cat files from the HTML army builder. Needs node.
# usage: sh run.sh path/to/Unit_cost_calculator.html
HTML="$1"
S=$(grep -n '^<script>\|^  <script>' "$HTML" | head -1 | cut -d: -f1)
E=$(grep -n '^function getArmouryDefsForCurrentFaction' "$HTML" | cut -d: -f1)
sed -n "$((S+1)),$((E-1))p" "$HTML" > data.js
node probe.js && node build.js
