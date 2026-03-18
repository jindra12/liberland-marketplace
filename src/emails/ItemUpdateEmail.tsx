/* eslint-disable @next/next/no-head-element */

import { readFileSync } from 'node:fs'
import path from 'node:path'

import type { NotificationChange } from '@/utilities/notificationDiff'

export type ItemUpdateEmailProps = {
  eyebrow?: string
  documentURL: string
  changes: NotificationChange[]
  collectionLabel: string
  intro?: string
  title: string
  unsubscribeURL: string
}

const itemUpdateEmailStyles = readFileSync(
  path.resolve(process.cwd(), 'src/emails/ItemUpdateEmail.scss'),
  'utf8',
)

export const ItemUpdateEmail = ({
  eyebrow,
  documentURL,
  changes,
  collectionLabel,
  intro,
  title,
  unsubscribeURL,
}: ItemUpdateEmailProps) => {
  const visibleChanges = changes.slice(0, 20)
  const remainingChanges = changes.length - visibleChanges.length
  const eyebrowText = eyebrow ?? `${collectionLabel} updated`
  const introText =
    intro ?? `A subscribed ${collectionLabel.toLowerCase()} changed. Here is what moved.`

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
        <style>{itemUpdateEmailStyles}</style>
      </head>
      <body className="item-update-email">
        <table className="item-update-email__card" role="presentation">
          <tbody>
            <tr>
              <td className="item-update-email__cell">
                <p className="item-update-email__eyebrow">{eyebrowText}</p>
                <h1 className="item-update-email__title">{title}</h1>
                <p className="item-update-email__intro">{introText}</p>
              </td>
            </tr>
            <tr>
              <td className="item-update-email__cell item-update-email__cell--actions">
                <a className="item-update-email__button" href={documentURL}>
                  View in marketplace
                </a>
              </td>
            </tr>
            <tr>
              <td className="item-update-email__cell item-update-email__cell--full">
                <table className="item-update-email__table" role="presentation">
                  <thead>
                    <tr className="item-update-email__table-head">
                      <th className="item-update-email__table-heading">Field</th>
                      <th className="item-update-email__table-heading">Before</th>
                      <th className="item-update-email__table-heading">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleChanges.map((change) => (
                      <tr key={change.path}>
                        <td className="item-update-email__table-cell item-update-email__table-cell--field">
                          {change.label}
                        </td>
                        <td className="item-update-email__table-cell item-update-email__table-cell--muted">
                          {change.before}
                        </td>
                        <td className="item-update-email__table-cell">{change.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {remainingChanges > 0 ? (
                  <p className="item-update-email__muted item-update-email__more">
                    {remainingChanges} more change(s) not shown.
                  </p>
                ) : null}
              </td>
            </tr>
            <tr>
              <td className="item-update-email__cell item-update-email__cell--footer">
                <a className="item-update-email__unsubscribe" href={unsubscribeURL}>
                  Unsubscribe from this {collectionLabel.toLowerCase()}
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  )
}
