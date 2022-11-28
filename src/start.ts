import { Server, Probot, ProbotOctokit } from 'probot'
import { default as app } from './app'
import { default as dotenv } from 'dotenv'
import { Options, ServerOptions } from 'probot/lib/types'
import { GetLogOptions, getLog } from 'probot/lib/helpers/get-log'
import { readEnvOptions } from 'probot/lib/bin/read-env-options'

dotenv.config()

const envOptions = readEnvOptions(process?.env)

const {
  // log options
  logLevel: level,
  logFormat,
  logLevelInString,
  logMessageKey,
  sentryDsn,

  // server options
  host,
  port,
  webhookPath,
  webhookProxy,

  // probot options
  appId,
  privateKey,
  redisConfig,
  secret,
  baseUrl,
} = {
  ...envOptions,
}

const logOptions: GetLogOptions = {
  level,
  logFormat,
  logLevelInString,
  logMessageKey,
  sentryDsn,
}

const log = getLog(logOptions)

const probotOptions: Options = {
  appId,
  privateKey,
  redisConfig,
  secret,
  baseUrl,
  log: log.child({ name: 'probot' }),
  Octokit: ProbotOctokit.defaults({
    retry: {
      doNotRetry: [400, 401, 403, 422],
    },
  }),
}

const serverOptions: ServerOptions = {
  host,
  port,
  webhookPath,
  webhookProxy,
  log: log.child({ name: 'server' }),
  Probot: Probot.defaults(probotOptions),
}

if (!appId || !privateKey) {
  if (!appId) {
    throw new Error(
      'App ID is missing, and is required to run in production mode. ' +
        'To resolve, ensure the APP_ID environment variable is set.',
    )
  } else if (!privateKey) {
    throw new Error(
      'Certificate is missing, and is required to run in production mode. ' +
        'To resolve, ensure either the PRIVATE_KEY or PRIVATE_KEY_PATH environment variable is set and contains a valid certificate',
    )
  }
}

const server = new Server(serverOptions)

server.load(app).then(() => server.start())
