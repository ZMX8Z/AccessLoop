import { APIError, type CollectionConfig } from 'payload'

const deny = () => false

export const Photos: CollectionConfig = {
  slug: 'photos',
  admin: { hidden: true },
  endpoints: false,
  access: { create: deny, read: deny, update: deny, delete: deny },
  upload: {
    disableLocalStorage: true,
    focalPoint: false,
    imageSizes: [],
    mimeTypes: ['image/jpeg', 'image/png'],
    handlers: [(req) => {
      if (req.context.internalPhotoRead === true) return undefined
      return Response.json({ errors: [{ message: 'Not found.' }] }, {
        status: 404, headers: { 'Cache-Control': 'private, no-store' },
      })
    }],
  },
  hooks: {
    beforeOperation: [({ args, operation, req }) => {
      if (['create', 'update', 'delete'].includes(operation) && req.context.internalPhotoWrite !== true) {
        throw new APIError('Use the authorized photo upload service.', 403, undefined, true)
      }
      return args
    }],
  },
  fields: [
    { name: 'id', type: 'text', required: true },
    { name: 'regionId', type: 'text', required: true, index: true },
    { name: 'purpose', type: 'select', required: true, options: ['report', 'review_evidence'] },
    { name: 'ownerSessionHash', type: 'text', index: true },
    { name: 'ownerAdminId', type: 'text', index: true },
    { name: 'imageHash', type: 'text', required: true, index: true },
    { name: 'uploadState', type: 'select', required: true, defaultValue: 'staging', options: ['staging', 'ready'] },
  ],
}
