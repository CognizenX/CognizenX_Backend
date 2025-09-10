# CognizenX Backend - Developer Setup Guide

## 🚀 Quick Start (5 minutes)

### Prerequisites
- **Node.js**: 18+ (check with `node --version`)
- **MongoDB**: Local or cloud instance
- **OpenAI API Key**: For AI features

### Setup Steps
```bash
# 1. Clone the repository
git clone https://github.com/shulabhb/CognizenX_Backend.git
cd CognizenX_Backend

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your values (see Environment Variables section)

# 4. Start the server
npm start
```

---

## 🔧 Environment Variables

Create a `.env` file in the root directory with the following variables:

```env
# Database
MONGO_URI=mongodb://localhost:27017/cognigenx
# OR for cloud MongoDB:
# MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/cognigenx

# Server Configuration
NODE_ENV=development
PORT=6000

# OpenAI API (Required for AI features)
OPENAI_API_KEY=sk-your-openai-api-key-here

# JWT Secret (Optional - for future JWT implementation)
JWT_SECRET=your-jwt-secret-here
```

### 🔑 Getting API Keys

#### OpenAI API Key:
1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign up/Login
3. Go to API Keys section
4. Create a new API key
5. Copy and paste into `.env` file

#### MongoDB:
- **Local**: Install MongoDB locally or use Docker
- **Cloud**: Use MongoDB Atlas (free tier available)

---

## 📁 Project Structure

```
CognizenX_Backend/
├── app.js                 # Main application file
├── index.js              # Server entry point
├── package.json          # Dependencies
├── .env                  # Environment variables (create this)
├── .gitignore           # Git ignore rules
├── vercel.json          # Vercel deployment config
├── models/              # Database models
│   ├── User.js
│   ├── TriviaCategory.js
│   └── UserActivity.js
├── routes/              # API routes
│   └── auth.js
├── services/            # Business logic
│   ├── openaiService.js
│   └── questionTemplates.js
├── scripts/             # Utility scripts
│   └── migrate.js
└── tests/               # Test files
    ├── app.test.js
    └── ...
```

---

## 🚀 Available Scripts

```bash
# Start development server
npm start

# Run tests
npm test

# Start with nodemon (auto-restart)
npm run dev
```

---

## 📡 API Endpoints

### Authentication (`/api/auth/`)
- **POST** `/api/auth/signup` - User registration
- **POST** `/api/auth/login` - User login
- **GET** `/api/auth/get-user-id` - Get user ID (protected)
- **DELETE** `/api/auth/delete-account` - Delete account (protected)

### Main API
- **GET** `/api/user-preferences` - Get user preferences (protected)
- **POST** `/api/log-activity` - Log user activity (protected)
- **GET** `/api/questions` - Get questions by category
- **GET** `/api/random-questions` - Get random questions
- **POST** `/api/add-questions` - Add questions (admin)

### AI Features (NEW)
- **POST** `/api/generate-questions` - Generate AI trivia questions (protected)
- **POST** `/api/generate-explanation` - Generate AI explanations (protected)

---

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Test Individual Files
```bash
# Test specific functionality
npm test -- --grep "user preferences"
npm test -- --grep "question generation"
```

---

## 🚨 Troubleshooting

### Common Issues

#### 1. MongoDB Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:27017
```
**Solution**: Make sure MongoDB is running locally or check your MONGO_URI

#### 2. OpenAI API Error
```
Error: OpenAI API key not set
```
**Solution**: Check your OPENAI_API_KEY in .env file

#### 3. Port Already in Use
```
Error: listen EADDRINUSE :::6000
```
**Solution**: Change PORT in .env file or kill the process using port 6000

#### 4. Module Not Found
```
Error: Cannot find module 'mongoose'
```
**Solution**: Run `npm install` to install dependencies

---

## 🔒 Security Notes

- **Never commit** `.env` file to Git
- **Use environment variables** for all sensitive data
- **Rotate API keys** regularly
- **Use HTTPS** in production
- **Validate all inputs** before processing

---

## 🚀 Deployment

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

### Other Platforms
- **Heroku**: Use Heroku CLI and set config vars
- **Railway**: Connect GitHub repo and set environment variables
- **DigitalOcean**: Use App Platform

---

## 🤝 Contributing

### Development Workflow
1. **Create feature branch**: `git checkout -b feature/your-feature`
2. **Make changes**: Implement your feature
3. **Test changes**: Run `npm test`
4. **Commit changes**: `git commit -m "Add your feature"`
5. **Push branch**: `git push origin feature/your-feature`
6. **Create pull request**: On GitHub

### Code Standards
- **Use consistent formatting**: Follow existing code style
- **Add comments**: Document complex logic
- **Write tests**: Add tests for new features
- **Handle errors**: Proper error handling and logging

---

## 📞 Support

### Resources
- **Node.js Docs**: https://nodejs.org/docs/
- **Express.js Docs**: https://expressjs.com/
- **MongoDB Docs**: https://docs.mongodb.com/
- **OpenAI API Docs**: https://platform.openai.com/docs

### Getting Help
- **Create GitHub issue** for bugs
- **Use GitHub discussions** for questions
- **Check existing issues** before creating new ones

---

## ✅ Verification Checklist

Before starting development, verify:

- [ ] Node.js 18+ installed
- [ ] MongoDB running (local or cloud)
- [ ] OpenAI API key configured
- [ ] Dependencies installed (`npm install`)
- [ ] Environment variables set (`.env` file)
- [ ] Server starts without errors (`npm start`)
- [ ] API endpoints respond correctly
- [ ] Tests pass (`npm test`)

---

**Welcome to the CognizenX Backend development team!** 🚀

**Repository**: https://github.com/shulabhb/CognizenX_Backend  
**Status**: Ready for development  
**Last Updated**: December 2024
