const STATUS_NAMES = {
  400: 'Bad Request',
  404: 'Not Found',
  409: 'Conflict',
  422: 'Unprocessable Entity'
};

module.exports = function httpError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.name = STATUS_NAMES[status] || 'Error';
  error.code = code;
  return error;
};