/* eslint-disable @next/next/no-head-element */

export type NotificationEmailDetail = {
  label: string
  value: string
}

export type NotificationEmailProps = {
  details: NotificationEmailDetail[]
  footer?: string
  intro: string
  title: string
}

export const NotificationEmail = (props: NotificationEmailProps) => {
  const hasDetails = props.details.length > 0

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta content="width=device-width, initial-scale=1" name="viewport" />
      </head>
      <body>
        <table role="presentation">
          <tbody>
            <tr>
              <td>
                <h1>{props.title}</h1>
                <p>{props.intro}</p>
              </td>
            </tr>
            {hasDetails ? (
              <tr>
                <td>
                  <table role="presentation">
                    <tbody>
                      {props.details.map((detail) => (
                        <tr key={detail.label}>
                          <td>
                            <strong>{detail.label}:</strong>
                          </td>
                          <td>{detail.value}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </td>
              </tr>
            ) : null}
            {props.footer ? (
              <tr>
                <td>
                  <p>{props.footer}</p>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </body>
    </html>
  )
}
