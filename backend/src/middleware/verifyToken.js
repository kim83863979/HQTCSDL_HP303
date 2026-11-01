const jwt = require("jsonwebtoken");

const SECRET_KEY = process.env.JWT_SECRET || "day_la_secret_key_demo_nen_doi_trong_thuc_te";

const verifyToken = (req, res, next) => {
    // Client phải gửi header: Authorization: Bearer <token>
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
        return res.status(401).send({ message: "Không có token, vui lòng đăng nhập" });
    }

    const token = authHeader.split(" ")[1]; // bỏ chữ "Bearer"

    if (!token) {
        return res.status(401).send({ message: "Token không hợp lệ" });
    }

    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: "Token hết hạn hoặc không hợp lệ" });
        }
        req.user = decoded; // { id, username, role }
        next();
    });
};

// Dùng SAU verifyToken. Ví dụ: authorizeRoles("admin")
const authorizeRoles = (...allowedRoles) => (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
        return res.status(403).send({ message: "Bạn không có quyền truy cập chức năng này" });
    }
    next();
};

module.exports = { verifyToken, authorizeRoles };