const GENERIC_MESSAGE = "Verify your EnSync engine is still operating";
const GENERAL_RESPONSE = "Failed to establish a connection with an EnSync engine";
const EVENT_NOT_FOUND = "Event not found or no longer available";
const INVALID_DELAY = "Delay must be between 1000ms and 24 hours";

class EnSyncError extends Error {
  constructor(e = "", name = "EnSyncGenericError", ...args) {
    let msg;
    if (e.constructor.name === "String") msg = e;
    else if (e.response) msg = e.response.data;
    else if (e.name == "AggregateError" || e.name == "AxiosError") msg = GENERAL_RESPONSE;
    else if (!e.response) msg = e.message;
    super(msg, ...args);
    this.name = name;
    this.message = msg;
  }
}

module.exports = {
  EnSyncError,
  GENERIC_MESSAGE,
  EVENT_NOT_FOUND,
  INVALID_DELAY,
};
