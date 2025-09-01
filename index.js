import {
    Client,
    GatewayIntentBits,
    Partials,
    REST,
    Routes,
    SlashCommandBuilder,
  } from "discord.js";
  import dotenv from "dotenv";
  import cron from "node-cron";
  import { Low } from "lowdb";
  import { JSONFile } from "lowdb/node";
  
  dotenv.config();
  
  /* ================= DATABASE ================= */
  const adapter = new JSONFile("db.json");
  const db = new Low(adapter, { servers: {} });
  await db.read();
  
  /* ================= MESSAGE POOLS ================= */
  const MESSAGES = {
    en: {
      reminder: [
        "It’s grind time. Everyone better drop an update in {room} — no excuses.",
        "Tick tock, {room} needs your updates. Don’t slack.",
        "This isn’t nap time. Move it. Updates go in {room}, now.",
        "Clock’s running. Updates → {room}. Don’t keep me waiting.",
        "Lazy bones detected. Prove me wrong — update {room}.",
        "Still sitting around? Updates belong in {room}. Chop chop.",
        "I better see something in {room} before the deadline.",
      ],
      missed: [
        "{user}, you had ONE job. Post in {room}. You failed.",
        "{user}, nothing from you? Disappointing.",
        "{user}, silence again? Do you even care?",
        "{user}, you think coasting will fly? Wrong.",
        "{user}, useless without updates. {room} was waiting.",
        "{user}, deadlines are not suggestions.",
        "{user}, you ghosted again. Try harder.",
      ],
      success: [
        "Well, look at that. Everyone managed to update. Miracles do happen.",
        "Fine, good job. I’ll allow it this once.",
        "Updates all in? Guess you’re not completely hopeless.",
        "Alright, everyone pulled through. Barely.",
        "Okay, updates done. Don’t get cocky.",
      ],
    },
    ar: {
      reminder: [
        "يلا يا كسالى، التحديثات في {room} الحين.",
        "الوقت يمشي، وين التحديثات؟ {room} ينتظركم.",
        "ما عندنا نوم، عطونا تحديثاتكم في {room}.",
        "إلى {room} يا شباب، بسرعة قبل ما أعصب.",
        "الكسل واضح، ورونا شغلكم في {room}.",
      ],
      missed: [
        "{user} ما كتبت شي؟ وش عذرك؟",
        "{user} لا جديد منك؟ عادي عندك؟",
        "{user} تسوي نفسك مشغول؟ {room} ناقص تحديثك.",
        "{user} مرة ثانية بدون تحديث؟ عيب.",
        "{user} تتجاهل؟ ترى محسوبة عليك.",
      ],
      success: [
        "أوه! الكل حدث؟ معجزة.",
        "زين. هالمرة مشيتها لكم.",
        "كل التحديثات وصلت. شكلكم مركزين.",
        "تمام. لا تخلوني أندم.",
        "كويس. استمروا كذا.",
      ],
    },
  };
  
  /* ================= ESCALATIONS ================= */
  const ESCALATIONS = {
    en: [
      "{user}, strike one. Don’t test me again.",
      "{user}, again? You’re already on thin ice.",
      "{user}, pathetic. Third time — what’s even the point of you?",
      "{user}, unbelievable streak of laziness. Do better.",
      "{user}, lost cause. I’m done with you.",
    ],
    ar: [
      "{user} أول مرة، ما أبي أعيدها.",
      "{user} ثاني مرة؟ ترى خلاص ما عاد ينبلع.",
      "{user} ثالث مرة… صرت مضرب مثل بالكرف.",
      "{user} إصرارك على الكسل عجيب.",
      "{user} hopeless. لا أمل فيك.",
    ],
  };
  
  /* ================= HELPERS ================= */
  function getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  
  function getEscalation(lang, misses, userId) {
    const pool = ESCALATIONS[lang] || ESCALATIONS.en;
    const idx = Math.min(misses - 1, pool.length - 1);
    return pool[idx].replace("{user}", `<@${userId}>`);
  }
  
  /* ================= DISCORD CLIENT ================= */
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel],
  });
  
  /* ================= SLASH COMMANDS ================= */
  const commands = [
    new SlashCommandBuilder()
      .setName("init")
      .setDescription("Initialize the bot for this server")
      .addChannelOption((opt) =>
        opt.setName("update_room").setDescription("Room for daily updates").setRequired(true)
      )
      .addChannelOption((opt) =>
        opt.setName("announce_room").setDescription("Room for reminders").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("set-language")
      .setDescription("Set bot language")
      .addStringOption((opt) =>
        opt.setName("lang").setDescription("Language (en/ar)").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("set-reminder")
      .setDescription("Set reminder hour (0-23)")
      .addIntegerOption((opt) =>
        opt.setName("hour").setDescription("Hour of the day").setRequired(true)
      ),
    new SlashCommandBuilder()
      .setName("set-deadline")
      .setDescription("Set deadline hour (0-23)")
      .addIntegerOption((opt) =>
        opt.setName("hour").setDescription("Hour of the day").setRequired(true)
      ),
    new SlashCommandBuilder().setName("status").setDescription("Show current configuration"),
    new SlashCommandBuilder().setName("reset-strikes").setDescription("Reset all missed counters"),
  ];
  
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
    body: commands.map((c) => c.toJSON()),
  });
  
  /* ================= BOT LOGIC ================= */
  client.once("ready", () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
  });
  
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const { commandName, guildId } = interaction;
  
    if (!db.data.servers[guildId]) {
      db.data.servers[guildId] = {
        updateRoom: null,
        announceRoom: null,
        language: "en",
        reminderHour: 9,
        deadlineHour: 11,
        updatesToday: [],
        userMisses: {},
      };
    }
    const conf = db.data.servers[guildId];
  
    switch (commandName) {
      case "init": {
        conf.updateRoom = interaction.options.getChannel("update_room").id;
        conf.announceRoom = interaction.options.getChannel("announce_room").id;
        await db.write();
        await interaction.reply("✅ Bot initialized for this server.");
        break;
      }
      case "set-language": {
        conf.language = interaction.options.getString("lang");
        await db.write();
        await interaction.reply(`✅ Language set to ${conf.language}`);
        break;
      }
      case "set-reminder": {
        conf.reminderHour = interaction.options.getInteger("hour");
        await db.write();
        await interaction.reply(`✅ Reminder set to ${conf.reminderHour}:00`);
        break;
      }
      case "set-deadline": {
        conf.deadlineHour = interaction.options.getInteger("hour");
        await db.write();
        await interaction.reply(`✅ Deadline set to ${conf.deadlineHour}:00`);
        break;
      }
      case "status": {
        await interaction.reply(
          `📊 **Config:**\nUpdate Room: <#${conf.updateRoom}>\nAnnounce Room: <#${conf.announceRoom}>\nLang: ${conf.language}\nReminder: ${conf.reminderHour}:00\nDeadline: ${conf.deadlineHour}:00`
        );
        break;
      }
      case "reset-strikes": {
        conf.userMisses = {};
        await db.write();
        await interaction.reply("✅ All strike counts reset.");
        break;
      }
    }
  });
  
  /* ================= DAILY JOBS ================= */
  // Reset daily
  cron.schedule("0 0 * * *", async () => {
    for (const guildId in db.data.servers) {
      db.data.servers[guildId].updatesToday = [];
    }
    await db.write();
  });
  
  // Reminders
  cron.schedule("0 * * * *", async () => {
    const now = new Date();
    const hour = now.getHours();
  
    for (const [guildId, conf] of Object.entries(db.data.servers)) {
      if (hour === conf.reminderHour) {
        const announceChannel = await client.channels.fetch(conf.announceRoom);
        announceChannel.send(
          getRandom(MESSAGES[conf.language].reminder).replace(
            "{room}",
            `<#${conf.updateRoom}>`
          )
        );
      }
    }
  });
  
  // Deadlines
  cron.schedule("0 * * * *", async () => {
    const now = new Date();
    const hour = now.getHours();
  
    for (const [guildId, conf] of Object.entries(db.data.servers)) {
      if (hour === conf.deadlineHour) {
        const guild = await client.guilds.fetch(guildId);
        const announceChannel = await client.channels.fetch(conf.announceRoom);
        const updateRoom = await client.channels.fetch(conf.updateRoom);
  
        const members = await guild.members.fetch();
        const missing = members.filter(
          (m) => !m.user.bot && !conf.updatesToday.includes(m.id)
        );
  
        if (missing.size > 0) {
          missing.forEach(async (member) => {
            conf.userMisses[member.id] = (conf.userMisses[member.id] || 0) + 1;
            announceChannel.send(
              getEscalation(conf.language, conf.userMisses[member.id], member.id).replace(
                "{room}",
                `<#${conf.updateRoom}>`
              )
            );
          });
        } else {
          announceChannel.send(getRandom(MESSAGES[conf.language].success));
        }
        await db.write();
      }
    }
  });
  
  /* ================= TRACK UPDATES ================= */
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
  
    const conf = db.data.servers[message.guildId];
    if (!conf) return;
  
    if (message.channel.id === conf.updateRoom) {
      if (!conf.updatesToday.includes(message.author.id)) {
        conf.updatesToday.push(message.author.id);
        await db.write();
      }
    }
  });
  
  /* ================= LOGIN ================= */
  client.login(process.env.BOT_TOKEN);
  