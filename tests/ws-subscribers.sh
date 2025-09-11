#!/bin/bash

for i in {1..1000}; do (node websocket-producer.js > websocket_$i.log) & done; wait

for i in {1..1000}; do echo "=== Output $i ==="; tail -n 6 websocket_$i.log; echo; done