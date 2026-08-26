import type { ReactNode, TextareaHTMLAttributes, InputHTMLAttributes } from 'react'

type BaseProps = {
  label: string
  hint?: string
  required?: boolean
  className?: string
  id?: string
}

type InputFieldProps = BaseProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className' | 'id'> & {
    multiline?: false
  }

type TextareaFieldProps = BaseProps &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className' | 'id'> & {
    multiline: true
  }

export function Field(props: InputFieldProps | TextareaFieldProps) {
  const { label, hint, required, className = '', id: idProp } = props
  const id =
    idProp ?? `field-${label.replace(/\s+/g, '-').toLowerCase()}`

  let control: ReactNode
  if (props.multiline) {
    const { label: _l, hint: _h, required: _r, className: _c, multiline: _m, id: _id, ...textareaRest } =
      props
    control = <textarea id={id} className="ui-textarea" {...textareaRest} />
  } else {
    const { label: _l, hint: _h, required: _r, className: _c, multiline: _m, id: _id, ...inputRest } =
      props
    control = <input id={id} className="ui-input" {...inputRest} />
  }

  return (
    <label className={`ui-field${className ? ` ${className}` : ''}`} htmlFor={id}>
      <span className="ui-field-label">
        {label}
        {required ? (
          <>
            {' '}
            <span className="ui-req" aria-hidden>
              *
            </span>
          </>
        ) : null}
      </span>
      {hint ? <p className="ui-field-hint">{hint}</p> : null}
      {control}
    </label>
  )
}
