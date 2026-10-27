// 관리자 제품 폼 공용 입력 조각 — 라벨·도움말·오류를 한 덩어리로 묶는다. 도움말은 등록자가
// 읽고 바로 채울 수 있게 erd.md·asset-pipeline.md 근거로 각 화면에서 문구를 넘긴다.

import type { ReactNode } from 'react';

import type { BooleanChoice, SelectOption } from '@/types/admin/productForm';

const INPUT_CLASS =
  'bg-paper text-ink placeholder:text-ash w-full rounded-[10px] border px-4 py-2.5 text-[15px] outline-none disabled:bg-fog/50 disabled:text-ash';

const borderClass = (hasError: boolean): string =>
  hasError ? 'border-danger-500' : 'border-ash/40';

export const FieldError = ({ message }: { message: string }) => (
  <p role="alert" className="text-danger-700 text-[13px] leading-5">
    {message}
  </p>
);

type ShellProps = {
  id: string;
  label: string;
  help: string;
  isRequired?: boolean;
  error?: string;
  children: ReactNode;
};

const FieldShell = ({ id, label, help, isRequired = false, error, children }: ShellProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={id} className="text-ink text-[15px] font-semibold">
      {label}
      {isRequired ? (
        <span className="text-danger-500" aria-hidden="true">
          {' '}
          *
        </span>
      ) : (
        <span className="text-ash text-[13px] font-normal"> (선택)</span>
      )}
    </label>
    {children}
    <p className="text-ash text-[13px] leading-5">{help}</p>
    {error ? <FieldError message={error} /> : null}
  </div>
);

type TextFieldProps = {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  isRequired?: boolean;
  error?: string;
  placeholder?: string;
  isDisabled?: boolean;
};

export const TextField = ({
  id,
  label,
  help,
  value,
  onChange,
  isRequired = false,
  error,
  placeholder,
  isDisabled = false,
}: TextFieldProps) => (
  <FieldShell id={id} label={label} help={help} isRequired={isRequired} error={error}>
    <input
      id={id}
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      disabled={isDisabled}
      aria-invalid={error ? true : undefined}
      className={`${INPUT_CLASS} ${borderClass(Boolean(error))}`}
    />
  </FieldShell>
);

type NumberFieldProps = TextFieldProps & {
  /** 오른쪽에 붙는 단위 표기(mm·g·K·원 등). */
  unit?: string;
};

// type=number 대신 inputMode를 쓴다 — 스크롤 휠로 값이 바뀌는 사고를 막고, 정수 검사는
// 검증(productSpecValidation)이 문자열 그대로 한다.
export const NumberField = ({
  id,
  label,
  help,
  value,
  onChange,
  isRequired = false,
  error,
  placeholder,
  isDisabled = false,
  unit,
}: NumberFieldProps) => (
  <FieldShell id={id} label={label} help={help} isRequired={isRequired} error={error}>
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={isDisabled}
        aria-invalid={error ? true : undefined}
        className={`${INPUT_CLASS} tabular-nums ${borderClass(Boolean(error))}`}
      />
      {unit ? <span className="text-ash shrink-0 text-[14px]">{unit}</span> : null}
    </div>
  </FieldShell>
);

type SelectFieldProps = {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  isRequired?: boolean;
  error?: string;
  isDisabled?: boolean;
  placeholder?: string;
};

export const SelectField = ({
  id,
  label,
  help,
  value,
  onChange,
  options,
  isRequired = false,
  error,
  isDisabled = false,
  placeholder = '선택하세요',
}: SelectFieldProps) => (
  <FieldShell id={id} label={label} help={help} isRequired={isRequired} error={error}>
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={isDisabled}
      aria-invalid={error ? true : undefined}
      className={`${INPUT_CLASS} ${borderClass(Boolean(error))}`}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </FieldShell>
);

type TextAreaFieldProps = TextFieldProps & {
  rows?: number;
};

export const TextAreaField = ({
  id,
  label,
  help,
  value,
  onChange,
  isRequired = false,
  error,
  placeholder,
  isDisabled = false,
  rows = 4,
}: TextAreaFieldProps) => (
  <FieldShell id={id} label={label} help={help} isRequired={isRequired} error={error}>
    <textarea
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      disabled={isDisabled}
      aria-invalid={error ? true : undefined}
      className={`${INPUT_CLASS} resize-none ${borderClass(Boolean(error))}`}
    />
  </FieldShell>
);

const BOOLEAN_CHOICES: readonly { value: BooleanChoice; label: string }[] = [
  { value: 'yes', label: '예' },
  { value: 'no', label: '아니오' },
  { value: 'unset', label: '미선택' },
];

type BooleanFieldProps = {
  id: string;
  label: string;
  help: string;
  value: BooleanChoice;
  onChange: (value: BooleanChoice) => void;
  error?: string;
  isDisabled?: boolean;
};

// 기본값 없는 3지 선택 — 미입력이 '아니오'로 둔갑하면 호환성 판정이 틀린다(erd.md 전역 규칙).
export const BooleanField = ({
  id,
  label,
  help,
  value,
  onChange,
  error,
  isDisabled = false,
}: BooleanFieldProps) => (
  <fieldset className="flex flex-col gap-1.5" disabled={isDisabled}>
    <legend className="text-ink text-[15px] font-semibold">
      {label}
      <span className="text-danger-500" aria-hidden="true">
        {' '}
        *
      </span>
    </legend>
    <div className="flex flex-wrap items-center gap-4 pt-1">
      {BOOLEAN_CHOICES.map((choice) => (
        <label
          key={choice.value}
          htmlFor={`${id}-${choice.value}`}
          className="text-ink flex cursor-pointer items-center gap-1.5 text-[15px]"
        >
          <input
            id={`${id}-${choice.value}`}
            type="radio"
            name={id}
            value={choice.value}
            checked={value === choice.value}
            onChange={() => onChange(choice.value)}
            className="accent-primary-500 size-4 cursor-pointer"
          />
          {choice.label}
        </label>
      ))}
    </div>
    <p className="text-ash text-[13px] leading-5">{help}</p>
    {error ? <FieldError message={error} /> : null}
  </fieldset>
);

type CheckboxGroupFieldProps = {
  id: string;
  label: string;
  help: string;
  value: readonly string[];
  onChange: (value: string[]) => void;
  options: readonly SelectOption[];
  error?: string;
};

// 값이 배열인 다중 선택 — FormSection이 2열 그리드라 한 줄을 통째로 쓴다.
export const CheckboxGroupField = ({
  id,
  label,
  help,
  value,
  onChange,
  options,
  error,
}: CheckboxGroupFieldProps) => (
  <fieldset className="col-span-2 flex flex-col gap-1.5">
    <legend className="text-ink text-[15px] font-semibold">
      {label}
      <span className="text-ash text-[13px] font-normal"> (선택)</span>
    </legend>
    {options.length === 0 ? (
      <p className="text-ash pt-1 text-[13px] leading-5">고를 수 있는 항목이 아직 없습니다.</p>
    ) : (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
        {options.map((option) => (
          <label
            key={option.value}
            htmlFor={`${id}-${option.value}`}
            className="text-ink flex cursor-pointer items-center gap-1.5 text-[15px]"
          >
            <input
              id={`${id}-${option.value}`}
              type="checkbox"
              name={id}
              value={option.value}
              checked={value.includes(option.value)}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...value, option.value]
                    : value.filter((selected) => selected !== option.value),
                )
              }
              className="accent-primary-500 size-4 cursor-pointer"
            />
            {option.label}
          </label>
        ))}
      </div>
    )}
    <p className="text-ash text-[13px] leading-5">{help}</p>
    {error ? <FieldError message={error} /> : null}
  </fieldset>
);

type SectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export const FormSection = ({ title, description, children }: SectionProps) => (
  <section className="border-ash/20 mt-6 rounded-2xl border p-6">
    <h2 className="text-ink text-[19px] font-semibold">{title}</h2>
    {description ? <p className="text-ash mt-1 text-[13px] leading-5">{description}</p> : null}
    <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">{children}</div>
  </section>
);
