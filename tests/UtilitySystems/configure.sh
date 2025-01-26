#!/bin/sh

# Create regular temperature reading system
event1=$(ensync-cli event create --name "utilityCompany/powerUsage" --payload '{"current.kWh":"int", "dateTime": "string"}')
event2=$(ensync-cli event create --name "utilityCompany/alerts/powerUsage/high" --payload '{"current.kWh":"int", "dateTime": "string"}')

echo "Access Key for internal app is $event1"
echo "Access Key for internal app is $event2"

# Create access key with permissions for sensor system
accessKey1=$(ensync-cli access-key create  --permissions '{"send": ["utilityCompany/powerUsage", "utilityCompany/alerts/powerUsage/high"]}')
echo "Access Key for internal app is $accessKey1"
accessKey2=$(ensync-cli access-key create  --permissions '{"receive": ["utilityCompany/alerts/powerUsage/high"]}')
echo "Access Key for internal app is $accessKey2"