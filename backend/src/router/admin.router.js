const express = require("express");
const adminRouter = express.Router();
const { User } = require("../model/index");
const { verifyToken, authorizeRoles } = require("../middleware/verifyToken");


adminRouter.use(verifyToken, authorizeRoles("admin"));


adminRouter.get("/users", async (req, res) => {
    try {
        const users = await User.findAll({ attributes: { exclude: ["password"] } });
        return res.status(200).send({ users });
    } catch (error) {
        console.error("Lỗi lấy danh sách user:", error);
        return res.status(500).send({ message: "Lỗi máy chủ. Vui lòng thử lại sau." });
    }
});


adminRouter.patch("/users/:id/role", async (req, res) => {
    try {
        const { role } = req.body || {};
        if (!["user", "admin"].includes(role)) {
            return res.status(400).send({ message: "Role không hợp lệ (chỉ 'user' hoặc 'admin')" });
        }

        
        if (Number(req.params.id) === req.user.id) {
            return res.status(400).send({ message: "Không thể tự đổi role của chính mình" });
        }

        const user = await User.findByPk(req.params.id);
        if (!user) {
            return res.status(404).send({ message: "Không tìm thấy user" });
        }

        user.role = role;
        await user.save();

        return res.status(200).send({
            message: "Cập nhật role thành công",
            user: { id: user.id, username: user.username, role: user.role }
        });
    } catch (error) {
        console.error("Lỗi đổi role:", error);
        return res.status(500).send({ message: "Lỗi máy chủ. Vui lòng thử lại sau." });
    }
});

module.exports = adminRouter;