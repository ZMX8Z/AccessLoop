import { APIError, type CollectionBeforeChangeHook, type CollectionConfig } from 'payload'

type AdminAccount = {
  collection?: string
  enabled?: boolean
  id: number | string
  role?: 'operator' | 'report_admin'
}

function isEnabledAccount(user: unknown): user is AdminAccount {
  if (!user || typeof user !== 'object') return false
  const account = user as AdminAccount
  return account.enabled === true && (account.role === 'operator' || account.role === 'report_admin')
}

export function isEnabledAdmin(user: unknown): user is AdminAccount {
  return isEnabledAccount(user) && user.collection === 'admins'
}

export function isOperator(user: unknown): user is AdminAccount & { role: 'operator'; enabled: true } {
  return isEnabledAdmin(user) && user.role === 'operator'
}

const forbidAdminWrite = () => new APIError('An enabled operator is required to manage administrator accounts.', 403, undefined, true)

// Hooks still execute when an internal operation uses overrideAccess, including first-register.
const guardAdminChange: CollectionBeforeChangeHook = async ({ context, data, operation, req }) => {
  if (isOperator(req.user)) return data

  if (operation === 'create' && !req.user && context.bootstrapAdmin === true) {
    const { totalDocs } = await req.payload.count({ collection: 'admins', overrideAccess: true, req })
    if (totalDocs === 0 && data.role === 'operator' && data.enabled === true) return data
  }

  throw forbidAdminWrite()
}

export const Admins: CollectionConfig = {
  slug: 'admins',
  auth: {
    cookies: { sameSite: 'Lax', secure: process.env.NODE_ENV === 'production' },
    maxLoginAttempts: 5,
    lockTime: 600_000,
  },
  admin: { useAsTitle: 'email' },
  access: {
    admin: ({ req }) => isEnabledAdmin(req.user),
    create: ({ req }) => isOperator(req.user),
    read: ({ req }) => {
      if (isOperator(req.user)) return true
      if (isEnabledAdmin(req.user)) return { id: { equals: req.user.id } }
      return false
    },
    update: ({ req }) => isOperator(req.user),
    delete: ({ req }) => isOperator(req.user),
  },
  endpoints: [
    {
      path: '/forgot-password',
      method: 'post',
      handler: async () => Response.json(
        { errors: [{ message: 'Email password recovery is not configured. Contact a deployment operator.' }] },
        { status: 503 },
      ),
    },
    {
      path: '/first-register',
      method: 'post',
      handler: async () => Response.json(
        { errors: [{ message: 'Public administrator registration is disabled.' }] },
        { status: 403 },
      ),
    },
  ],
  hooks: {
    beforeChange: [guardAdminChange],
    beforeDelete: [({ req }) => { if (!isOperator(req.user)) throw forbidAdminWrite() }],
    beforeLogin: [({ user }) => {
      if (!isEnabledAccount(user)) throw new APIError('This administrator account is disabled.', 403, undefined, true)
      return user
    }],
  },
  fields: [
    {
      name: 'role',
      type: 'select',
      required: true,
      defaultValue: 'report_admin',
      options: [
        { label: 'Report administrator', value: 'report_admin' },
        { label: 'Deployment operator', value: 'operator' },
      ],
    },
    { name: 'enabled', type: 'checkbox', required: true, defaultValue: true },
  ],
}
