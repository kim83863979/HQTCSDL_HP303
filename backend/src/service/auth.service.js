const bcrypt = require("bcrypt");
const { User } = require("../model/index");

const userlist = [
    {
        id: 1,
        username: "giahuy",
        password: "123456"  
    },
    {
        id: 2,
        username: "admin",
        password: "admin123"
    },
    {
        id: 3,
        username: "testuser",
        password: "test123"
    }
];
const registerUser = async (username, email, phonenumber, password) => {
    // kiểm tra username đã tồn tại chưa
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
        return { success: false, message: "Username đã tồn tại" };
    }

    // hash password trước khi lưu
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = await User.create({
        username,
        password: hashedPassword,
        email,
        phonenumber,
    });

    return { success: true, user: newUser };
};

const loginUser = async (username, password) => {
    const user = await User.findOne({ where: { username } });
    if (!user) {
        return { success: false, message: "Username không tồn tại" };
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
        return { success: false, message: "Sai mật khẩu" };
    }

    return { success: true, user };
};

module.exports = { registerUser, loginUser };