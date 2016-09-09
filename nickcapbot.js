// jshint node: true, esnext: true

'use strict'

let soontm = require('soontm')
let config = require('./config')

let client = new soontm.Client(config.irc)

var monitorInterval

client.on('error', function () {
  process.exit()
})

client.on('join', function (nick, channel) {
  if (channel === config.irc.channels[0] && nick === client.nick()) {
    client.privmsg(config.irc.channels[0], 'Monitoring nick "' + config.targetNick + '"')

    if (config.noMonitor) {
      monitorInterval = setInterval(function () {
        client.send('ISON ' + config.targetNick)
      }, config.isonInterval)
    } else {
      client.send('MONITOR + ' + config.targetNick)
    }
  }
})

function handle_nick_offline () {
  client.nick(config.targetNick)

  client.once('nick', function cb (oldNick, newNick) {
    if (oldNick === config.irc.nick && newNick === config.targetNick) {
      client.privmsg(config.irc.channels[0], config.pingList.join(', ') + ': Nick captured. Use ' + config.prefix + 'release to take control of it.')

      if (config.noMonitor) {
        clearInterval(monitorInterval)
      } else {
        client.send('MONITOR C')
      }
    } else {
      client.once('nick', cb)
    }
  })
}

client.on('rpl_monoffline', function (nick) {
  if (nick === config.targetNick) {
    client.privmsg(config.irc.channels[0], config.targetNick + ' left the network; attempting to capture nick.')
  }

  handle_nick_offline()
})

client.raw.on('303', function (line) {
  if (!line.args[1]) {
    handle_nick_offline()
  }
})

client.on('privmsg', function (source, target, message, line) {
  message = message.trimRight()

  if (target === client.nick()) {
    target = source
  }

  if (message.indexOf(config.prefix) !== 0 && target !== source) {
    return
  }

  let tokens = message.split(' ').map(function (token) {
    return token.trim()
  })

  let command = tokens[0]
  // let args = tokens.slice(1)

  if (target !== source) {
    command = command.slice(config.prefix.length)
  }

  switch (command) {
    case 'release':
      if (config.admins.indexOf(line.host) === -1) {
        client.notice(source, 'Access denied.')
        return
      }

      if (client.nick() !== config.targetNick) {
        client.notice(source, "I'm not currently using the nick.")
        return
      }

      client.nick(config.irc.nick)

      client.once('nick', function (oldNick, newNick) {
        if (oldNick === config.targetNick && newNick === client.nick()) {
          client.privmsg(target, source + ': The nick has been released. It will be captured again if you do not /nick to it within 10 seconds.')
        }
      })

      client.on('nick', function (oldNick, newNick) {
        if (oldNick === source && newNick === config.targetNick) {
          client.quit('My job here is done.')
        }
      })

      setTimeout(function () {
        client.privmsg(config.irc.channels[0], 'Nick capture re-enabled')

        if (config.noMonitor) {
          monitorInterval = setInterval(function () {
            client.send('ISON ' + config.targetNick)
          }, config.isonInterval)
        } else {
          client.send('MONITOR + ' + config.targetNick)
        }
      }, 10000)

      break
  }
})
