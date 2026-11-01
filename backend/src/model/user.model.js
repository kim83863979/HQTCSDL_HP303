const { DataTypes } = require("sequelize");

const createUserModel = (sequelize) => {
    const User = sequelize.define(
        "User",
        {
            username: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true   // không cho trùng username
            },
            password: {
                type: DataTypes.STRING(255),   // đủ dài để chứa chuỗi hash bcrypt
                allowNull: false
            },
            email : 
            {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true   // không cho trùng email
            },
            phonenumber :
            {
                type: DataTypes.STRING,
                allowNull: false,
                unique: true   
            },
            role: {
                type: DataTypes.ENUM("user", "admin"),
                allowNull: false,
                defaultValue: "user"   
            }
        },
        {
            timestamps: false
        }
    );
    return User;
};

module.exports = { createUserModel };