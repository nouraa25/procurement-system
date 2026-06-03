# 🚀 AI-Powered Procurement Management System

A modern, bilingual (Arabic/English) procurement management system with AI supplier suggestions, real-time chat, and role-based access control.

## ✨ Features

### 🤖 AI-Powered Supplier Suggestions
- Smart supplier recommendations based on category and rating
- Manual supplier selection option
- Database-driven supplier matching

### 👥 Role-Based Access
- **Manager Dashboard**: Create requests, manage suppliers, view analytics
- **Supplier Dashboard**: View incoming requests, accept/reject with reasons

### 💬 Real-Time Chat System
- Chat between managers and suppliers
- Auto-refresh messages (every 3 seconds)
- WhatsApp-style interface

### 🌍 Bilingual Support
- Arabic (RTL) - Default
- English (LTR)
- Dynamic language switching
- Session-persistent language preference

### 📊 Analytics & KPIs
- Total requests counter
- Pending, accepted, rejected status tracking
- Visual status badges with color coding

### 🎨 Modern UI
- Dark/green theme
- Responsive design (mobile-friendly)
- Bootstrap 5 with RTL support
- Smooth animations and transitions

## 🔐 Demo Accounts

### Manager Account
- **Email**: manager@procurement.com
- **Password**: password123

### Supplier Accounts
- **Supplier 1**: supplier1@company.com / password123
- **Supplier 2**: supplier2@company.com / password123
- **Supplier 3**: supplier3@company.com / password123

## 🏗️ Technology Stack

### Current (Modern Web Version)
- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Database**: Supabase (PostgreSQL)
- **UI Framework**: Bootstrap 5
- **Build Tool**: Vite
- **Icons**: Bootstrap Icons

## 📁 Project Structure

```
procurement-system/
├── src/
│   ├── config/
│   │   └── supabase.js          # Database configuration
│   ├── lang/
│   │   ├── ar.js                # Arabic translations
│   │   └── en.js                # English translations
│   ├── utils/
│   │   ├── auth.js              # Authentication functions
│   │   └── i18n.js              # Internationalization
│   ├── components/
│   │   └── Sidebar.js           # Sidebar component
│   ├── pages/
│   │   ├── Login.js             # Login page
│   │   ├── ManagerDashboard.js  # Manager dashboard
│   │   ├── ManagerRequests.js   # Request management
│   │   ├── ManagerSuppliers.js  # Supplier management
│   │   ├── SupplierDashboard.js # Supplier dashboard
│   │   └── RequestDetails.js    # Request details & chat
│   ├── styles/
│   │   └── main.css             # Global styles
│   └── main.js                  # Application entry point
├── index.html                   # Main HTML file
├── package.json                 # Dependencies
├── vite.config.js              # Vite configuration
└── .env                        # Environment variables
```

## 🔄 Complete Workflow

### Manager Flow
1. **Login** with manager credentials
2. **View Dashboard** with KPI cards (total, pending, accepted, rejected)
3. **Create Request**:
   - Enter product details (title, category, budget, quantity, deadline)
   - Choose supplier assignment method:
     - **Manual**: Browse all suppliers
     - **AI Suggestion**: Get top 3 suppliers by category & rating
   - Select one or multiple suppliers
4. **View Request Details**:
   - See all assigned suppliers
   - View supplier responses (accepted/rejected)
   - Chat with suppliers who responded
5. **Manage Suppliers**:
   - Add new suppliers to the database
   - View all suppliers with ratings

### Supplier Flow
1. **Login** with supplier credentials
2. **View Dashboard** with personal KPIs
3. **View Incoming Requests**:
   - See all assigned requests
   - View request details (product, budget, quantity, deadline)
4. **Respond to Requests**:
   - **Accept**: Mark as accepted, enable chat
   - **Reject**: Enter rejection reason
5. **Chat with Manager**:
   - Available after accepting or rejecting request
   - Real-time message exchange

## 🗄️ Database Schema

### Tables
- **users**: User accounts (email, password, role)
- **suppliers**: Supplier profiles (name, category, rating)
- **procurement_requests**: Purchase requests from managers
- **request_suppliers**: Assignment junction table
- **messages**: Chat messages between users

### Security
- Row Level Security (RLS) enabled on all tables
- Managers can only see their own requests
- Suppliers can only see assigned requests
- Users can only send/receive their own messages

## 🎯 Key Features Explained

### AI Supplier Suggestion Algorithm

```javascript
// Matches suppliers by:
// 1. Category (exact match)
// 2. Rating (highest first)
// 3. Returns top 3

SELECT * FROM suppliers
WHERE category = 'selected_category'
ORDER BY rating DESC
LIMIT 3;
```

### Chat System
- Stores messages in database
- Auto-refresh every 3 seconds
- Displays sender/receiver messages differently
- Shows timestamp for each message

### Language Switching
- Stored in localStorage
- Changes HTML dir attribute (rtl/ltr)
- Swaps Bootstrap CSS (RTL/LTR versions)
- Reloads page to apply changes

## 🚀 Running the Application

The application is already running! Access it at the provided URL.

To run locally:
```bash
npm install
npm run dev
```

## 📱 Responsive Design

The system is fully responsive and works on:
- Desktop (1920px+)
- Laptop (1366px - 1920px)
- Tablet (768px - 1366px)
- Mobile (320px - 768px)

## 🔒 Security Features

- Password hashing (bcrypt-style)
- Session-based authentication
- Role-based access control (RBAC)
- SQL injection prevention (parameterized queries)
- Row-level security policies

## 🎨 UI Components

- **KPI Cards**: Animated cards with icons
- **Data Tables**: Sortable, responsive tables
- **Modals**: Overlay dialogs for forms
- **Chat Interface**: WhatsApp-style messaging
- **Status Badges**: Color-coded status indicators
- **Sidebar Navigation**: Fixed sidebar with icons

## 📝 Sample Data

The database includes:
- 1 Manager account
- 3 Supplier accounts with profiles
- 5 Additional suppliers (various categories)
- Categories: Electronics, Printing, Furniture, Stationery, Software

## 🔧 Customization

### Adding New Categories
Edit `src/lang/ar.js` and `src/lang/en.js`:
```javascript
categories: {
  new_category: 'New Category Name',
  // ... existing categories
}
```

### Changing Colors
Edit CSS variables in `src/styles/main.css`:
```css
:root {
  --primary-color: #2d5f3f;
  --accent-color: #4a9d6f;
  /* ... other colors */
}
```

## 🐛 Troubleshooting

### Login Issues
- Ensure using correct email/password from demo accounts
- Check browser console for errors

### Language Not Switching
- Clear browser localStorage
- Reload the page

### Chat Not Loading
- Check if request status is accepted/rejected
- Verify both users exist in database

## 📄 License

This project is open source and available for educational purposes.

---

**Built with ❤️ using Modern Web Technologies**
