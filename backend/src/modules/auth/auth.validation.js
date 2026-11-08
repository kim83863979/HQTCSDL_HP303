const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;
const FULLNAME_RE = /^.{2,150}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateRegister(body) {
  const { email, fullname, password } = body || {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return 'Email không hợp lệ.';
  }
  if (typeof fullname !== 'string' || !FULLNAME_RE.test(fullname.trim())) {
    return 'Họ tên phải từ 2 đến 150 ký tự.';
  }
  if (typeof password !== 'string' || !PASSWORD_RE.test(password)) {
    return 'Mật khẩu phải có ít nhất 8 ký tự, chứa ít nhất một chữ cái và một chữ số.';
  }
  return null;
}

function validateLogin(body) {
  const { email, password } = body || {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) return 'Email không hợp lệ.';
  if (typeof password !== 'string' || !password) return 'Vui lòng nhập mật khẩu.';
  return null;
}

module.exports = { EMAIL_RE, UUID_RE, validateRegister, validateLogin };
