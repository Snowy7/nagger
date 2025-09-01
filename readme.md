# AnnoyBot 😈
A Discord bot that **harasses your server daily** until everyone posts their updates.  
Miss your deadline? The bot escalates the aggression each time.  

---

## Features
- 🕘 **Daily reminders & deadlines**
- 🔥 **Aggressive escalating punishments**
- 🌍 Multi-language support (English + Arabic)
- ⚙️ Slash command configuration
- 💾 Per-server persistent config with **lowdb**

---

## Setup

### 1. Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create an app → add a **bot**
3. Copy the **token**
4. Enable **Message Content Intent** + **Server Members Intent**
5. Invite bot with scope `bot + applications.commands`

### 2. Environment
Create `.env`:
```env
BOT_TOKEN=your_token_here
CLIENT_ID=your_client_id_here

