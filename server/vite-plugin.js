import { handleApi } from './api.js'
import { createState } from './state.js'

export function slipwayApi() {
  const state = createState()

  return {
    name: 'slipway-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const configured = server.config.server.port
        const port = typeof configured === 'number' ? configured : 47321
        const host = server.config.server.host
        const listenHost = host === true || host === undefined ? '0.0.0.0' : String(host)
        try {
          const handled = await handleApi(req, res, {
            state,
            port,
            listenHost,
          })
          if (!handled) next()
        } catch (error) {
          next(error)
        }
      })
    },
  }
}
