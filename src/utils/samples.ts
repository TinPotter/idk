export const pythonSample = `import discord
from discord.ext import commands

bot = commands.Bot(command_prefix="!")

@bot.command()
async def info(ctx, user: discord.Member = None):
    user = user or ctx.author

    embed = discord.Embed(
        title="User Information",
        description=f"Details about {user.mention}",
        color=0x5865F2,
        url="https://discord.com"
    )
    embed.set_author(name=f"{user.name}#{user.discriminator}")
    embed.set_thumbnail(url=user.avatar_url)
    embed.add_field(name="Account Created", value=str(user.created_at)[:10], inline=True)
    embed.add_field(name="Joined Server", value=str(user.joined_at)[:10], inline=True)
    embed.add_field(name="Roles", value=str(len(user.roles) - 1), inline=False)
    embed.set_footer(text="Requested via !info command")
    await ctx.send(embed=embed)

@bot.command()
async def server(ctx):
    guild = ctx.guild

    embed = discord.Embed(
        title=guild.name,
        description="Server Statistics",
        color=discord.Color.blurple
    )
    embed.add_field(name="Members", value=str(guild.member_count), inline=True)
    embed.add_field(name="Channels", value=str(len(guild.channels)), inline=True)
    embed.add_field(name="Region", value=str(guild.region), inline=False)
    embed.set_footer(text=f"ID: {guild.id}")
    await ctx.send(embed=embed)

@bot.command()
async def announce(ctx, *, message: str):
    embed = discord.Embed(
        title="📢 Announcement",
        description=message,
        color=discord.Color.gold,
        timestamp=ctx.message.created_at
    )
    embed.set_author(name=ctx.author.display_name)
    embed.set_footer(text="Official Announcement")
    await ctx.send(embed=embed)

bot.run("TOKEN")
`;

export const jsSample = `const { Client, EmbedBuilder, GatewayIntentBits } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'ping') {
    const embed = new EmbedBuilder()
      .setTitle('🏓 Pong!')
      .setDescription('Bot is online and responding.')
      .setColor(0x5865F2)
      .setFooter({ text: 'Latency check' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }

  if (interaction.commandName === 'profile') {
    const user = interaction.user;

    const profileEmbed = new EmbedBuilder()
      .setTitle(\`\${user.username}'s Profile\`)
      .setDescription('Your Discord profile information')
      .setColor(0x57F287)
      .setAuthor({ name: user.tag })
      .setThumbnail(user.displayAvatarURL())
      .addField('User ID', user.id, true)
      .addField('Account Type', user.bot ? 'Bot' : 'Human', true)
      .setFooter({ text: 'Profile System' })
      .setTimestamp();

    await interaction.reply({ embeds: [profileEmbed] });
  }

  if (interaction.commandName === 'help') {
    await interaction.reply({
      embeds: [{
        title: '📖 Help Center',
        description: 'Here are all available commands.',
        color: 0xFEE75C,
        fields: [
          { name: '/ping', value: 'Check bot latency', inline: true },
          { name: '/profile', value: 'View your profile', inline: true },
        ],
      }]
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
`;
