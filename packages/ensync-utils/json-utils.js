/**
 * JSON utility functions for EnSync SDK
 * Provides data type validation and JSON schema handling
 */

/**
 * Determines the JSON data type of a value according to EnSync engine rules
 * @param {*} value - The value to check
 * @returns {string} The data type as a string
 */
function getJsonType(value) {
  if (value === null) {
    return "null";
  }
  
  if (Array.isArray(value)) {
    return "array";
  }
  
  const jsType = typeof value;
  
  switch (jsType) {
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    case "number":
      // Distinguish between integer, long, float, and double
      if (Number.isInteger(value)) {
        // Check if it's within 32-bit integer range
        if (value >= -2147483648 && value <= 2147483647) {
          return "integer";
        }
        // Otherwise it's a long (64-bit integer)
        return "long";
      }
      // For floating point, default to double (JavaScript uses double precision)
      return "double";
    case "object":
      return "object";
    default:
      return "unknown";
  }
}

/**
 * Validates if a value matches the expected type according to EnSync engine rules
 * @param {*} value - The value to validate
 * @param {string} expectedType - The expected type
 * @returns {boolean} True if the value matches the expected type
 */
function validateType(value, expectedType) {
  const actualType = getJsonType(value);
  const expected = expectedType.toLowerCase();
  
  switch (expected) {
    case "string":
      return actualType === "string";
    case "integer":
    case "int":
      return actualType === "integer";
    case "long":
      return actualType === "long";
    case "double":
      return actualType === "double";
    case "float":
      return actualType === "float" || actualType === "double";
    case "boolean":
    case "bool":
      return actualType === "boolean";
    case "object":
      return actualType === "object";
    case "array":
      return actualType === "array";
    case "null":
      return actualType === "null";
    default:
      return false;
  }
}

/**
 * Validates a JSON payload against a schema
 * @param {Object} payload - The payload to validate
 * @param {Object} schema - The schema with expected types
 * @returns {Object} Validation result with success flag and errors array
 */
function validatePayloadSchema(payload, schema) {
  const errors = [];
  
  for (const key in schema) {
    if (schema.hasOwnProperty(key)) {
      const expectedType = schema[key];
      
      if (!payload.hasOwnProperty(key)) {
        errors.push(`Missing required field: ${key}`);
        continue;
      }
      
      if (!validateType(payload[key], expectedType)) {
        const actualType = getJsonType(payload[key]);
        errors.push(`Field '${key}' expected type '${expectedType}' but got '${actualType}'`);
      }
    }
  }
  
  return {
    success: errors.length === 0,
    errors
  };
}

/**
 * Gets the JSON schema (skeleton) of a payload with data types
 * @param {Object} payload - The payload to analyze
 * @param {boolean} [deep=false] - Whether to analyze nested objects
 * @returns {Object} Schema object with field names and their types
 */
function getPayloadSchema(payload, deep = false) {
  const schema = {};
  
  for (const key in payload) {
    if (payload.hasOwnProperty(key)) {
      const value = payload[key];
      const type = getJsonType(value);
      
      if (deep && type === "object" && value !== null) {
        schema[key] = getPayloadSchema(value, true);
      } else if (deep && type === "array" && value.length > 0) {
        schema[key] = {
          type: "array",
          items: getJsonType(value[0])
        };
      } else {
        schema[key] = type;
      }
    }
  }
  
  return schema;
}

/**
 * Analyzes a payload and returns comprehensive metadata
 * @param {Object} payload - The payload to analyze
 * @returns {Object} Analysis result with byteSize, schema, and fieldCount
 */
function analyzePayload(payload) {
  const payloadString = JSON.stringify(payload);
  const byteSize = Buffer.byteLength(payloadString, "utf8");
  const schema = getPayloadSchema(payload, false);
  const fieldCount = Object.keys(payload).length;
  
  return {
    byteSize,
    schema,
    fieldCount,
    isValid: true
  };
}

/**
 * Ensures a value is valid JSON
 * @param {*} value - The value to check
 * @returns {boolean} True if the value can be JSON serialized
 */
function isValidJson(value) {
  try {
    JSON.stringify(value);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Safely parses JSON with error handling
 * @param {string} jsonString - The JSON string to parse
 * @param {*} defaultValue - Default value to return on error
 * @returns {*} Parsed JSON or default value
 */
function safeJsonParse(jsonString, defaultValue = null) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    return defaultValue;
  }
}

module.exports = {
  getJsonType,
  validateType,
  validatePayloadSchema,
  getPayloadSchema,
  analyzePayload,
  isValidJson,
  safeJsonParse
};
