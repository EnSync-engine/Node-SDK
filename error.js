const GENERIC_MESSAGE = "Verify your EnSync engine is still operating";
const GENERAL_RESPONSE = "Failed to establish a connection with an EnSync engine";

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
};
