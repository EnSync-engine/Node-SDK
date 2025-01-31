#!/bin/sh

# Create regular temperature reading system
event1=$(ensync-cli event create --name "powerCompany/powerUsage" --payload '{"current.kWh":"int", "dateTime": "string"}')
event2=$(ensync-cli event create --name "powerCompany/alerts/powerUsage/high" --payload '{"current.kWh":"int", "dateTime": "string"}')

echo "Access Key for internal app is $event1"
echo "Access Key for internal app is $event2"

# Create access key with permissions for sensor system
accessKey1=$(ensync-cli access-key create  --permissions '{"send": ["powerCompany/powerUsage", "powerCompany/alerts/powerUsage/high"]}')
echo "Access Key for internal app is $accessKey1"
accessKey2=$(ensync-cli access-key create  --permissions '{"receive": ["powerCompany/alerts/powerUsage/high"]}')
echo "Access Key for internal app is $accessKey2"
accessKey3=$(ensync-cli access-key create  --permissions '{"receive": ["powerCompany/powerUsage"]}')
echo "Access Key for internal app is $accessKey3"