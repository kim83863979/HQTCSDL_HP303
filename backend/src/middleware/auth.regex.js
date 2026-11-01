const authRegex = {
    // Define your authentication regex patterns here
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    password: /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/, 
    username: /^[a-zA-Z]{5,}$/,
    phonenumber: /^(\+84|0)(3|5|7|8|9)\d{8}$/
};
const ValidateAuthInput = (req, res, next) => {
    const { username, email, password, phonenumber } = req.body;
    if (!authRegex.username.test(username)) {
        return res.status(400).send({ message: "Tên người dùng không hợp lệ. Nó phải chỉ chứa chữ cái và có ít nhất 10 ký tự." });
    }
    if (!authRegex.email.test(email)) {
        return res.status(400).send({ message: "Email không hợp lệ." });
    }
    if (!authRegex.password.test(password)) {
        return res.status(400).send({ message: "Password không hợp lệ. Nó phải có ít nhất 8 ký tự, chứa ít nhất một chữ cái và một số." });
    }
    if (phonenumber && !authRegex.phonenumber.test(phonenumber)) {
        return res.status(400).send({ message: "Số điện thoại không hợp lệ." });
    }
    next();
};

module.exports = { ValidateAuthInput };