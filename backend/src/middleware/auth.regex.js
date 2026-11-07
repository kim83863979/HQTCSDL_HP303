// src/middleware/auth.regex.js
// Middleware validate đầu vào cho API đăng ký.
// Trường theo ERD: email, fullname, password (không có username, phonenumber).

const EMAIL_RE    = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_RE = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*?&]{8,}$/;
const FULLNAME_RE = /^.{2,150}$/; // 2–150 ký tự bất kỳ

const ValidateRegisterInput = (req, res, next) => {
  const { email, fullname, password } = req.body;

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ message: 'Email không hợp lệ.' });
  }
  if (!fullname || !FULLNAME_RE.test(fullname.trim())) {
    return res.status(400).json({ message: 'Họ tên phải từ 2 đến 150 ký tự.' });
  }
  if (!password || !PASSWORD_RE.test(password)) {
    return res.status(400).json({
      message: 'Mật khẩu phải có ít nhất 8 ký tự, chứa ít nhất một chữ cái và một chữ số.',
    });
  }

  next();
};

const ValidateLoginInput = (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !EMAIL_RE.test(email)) {
    return res.status(400).json({ message: 'Email không hợp lệ.' });
  }
  if (!password) {
    return res.status(400).json({ message: 'Vui lòng nhập mật khẩu.' });
  }

  next();
};

// Giữ tên cũ để không break import từ auth.router.js
const ValidateAuthInput = ValidateRegisterInput;

module.exports = { ValidateAuthInput, ValidateRegisterInput, ValidateLoginInput };
