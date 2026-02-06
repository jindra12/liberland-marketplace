import { PaymentAdapter } from "node_modules/@payloadcms/plugin-ecommerce/dist/types";
import { GroupField } from "payload";

const group: GroupField = {
  name: 'crypto',
  type: 'group',
  admin: {
    condition: (data) => data?.paymentMethod === 'crypto',
  },
  fields: [
    {
      name: 'paymentRef',
      type: 'text',
      label: 'Payment reference (invoice / address)',
      admin: { readOnly: true },
    },
    {
      name: 'txHash',
      type: 'text',
      label: 'Transaction hash',
    },
  ],
}

export const cryptoAdapter = (): PaymentAdapter => ({
  initiatePayment: async ({

  }) => {
    return {
      message: "Yes",
    };
  },

  confirmOrder: async ({

  }) => {
    return {
      message: "No",
      orderID: "1",
      transactionID: "1",
    };
  },
  name: 'crypto',
  group,
});
