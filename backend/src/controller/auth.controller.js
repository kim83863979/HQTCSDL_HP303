const jwt = require("jsonwebtoken");
const { registerUser, loginUser } = require("../service/auth.service");
const SECRET_KEY = process.env.JWT_SECRET || "day_la_secret_key_demo_nen_doi_trong_thuc_te";

const register = async (req, res) => {
    try {
        const { username, password, email, phonenumber } = req.body;

        if (!username || !password || !email || !phonenumber) {
            return res.status(400).send({ message: "Thiếu thông tin cần thiết" });
        }

        const result = await registerUser(username, email, phonenumber, password);

        if (!result.success) {
            return res.status(400).send({ message: result.message });
        }

        return res.status(201).send({
            message: "Đăng ký thành công",
            user: {
                id: result.user.id,
                username: result.user.username,
                email: result.user.email,
                phonenumber: result.user.phonenumber,
                role: result.user.role
            }
        });
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            return res.status(409).send({ message: "Username, email hoặc số điện thoại đã tồn tại." });
        }

        console.error("Lỗi đăng ký:", error);
        return res.status(500).send({ message: "Lỗi máy chủ. Vui lòng thử lại sau." });
    }
};

const login = async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).send({ message: "Thiếu username hoặc password" });
        }

        const result = await loginUser(username, password);

        if (!result.success) {
            return res.status(401).send({ message: result.message });
        }

        
        const token = jwt.sign(
            { id: result.user.id, username: result.user.username, role: result.user.role },
            SECRET_KEY,
            { expiresIn: "1h" }
        );

        return res.status(200).send({
            message: "Đăng nhập thành công",
            token,
            user: {
                id: result.user.id,
                username: result.user.username,
                role: result.user.role
            }
        });
    } catch (error) {
        console.error("Lỗi đăng nhập:", error);
        return res.status(500).send({ message: "Lỗi máy chủ. Vui lòng thử lại sau." });
    }
};

module.exports = { register, login };