#!/bin/bash

for i in {1..1000}; do (node producer.js > output_$i.log) & done; wait

for i in {1..1000}; do echo "=== Output $i ==="; tail -n 6 output_$i.log; echo; done