// Shared Tailwind classes. Every input, select and option sets BOTH an
// explicit background and text colour so nothing can inherit light-on-light
// colours from the OS / browser theme (the UAT white-on-white defect).

export const inputClass =
  "block w-full rounded-md border border-slate-500 bg-white px-3 py-2 text-base text-slate-900 " +
  "placeholder:text-slate-500 shadow-sm " +
  "focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/40 " +
  "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-700 " +
  "aria-[invalid=true]:border-red-700 aria-[invalid=true]:ring-red-700/30";

export const optionClass = "bg-white text-slate-900";

export const labelClass = "block text-sm font-semibold text-slate-900";

export const fieldErrorClass = "mt-1 text-sm font-medium text-red-800";

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold " +
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "disabled:cursor-not-allowed disabled:opacity-100";

export const buttonClass = {
  primary: `${buttonBase} bg-blue-700 text-white hover:bg-blue-800 focus-visible:ring-blue-700 disabled:bg-slate-300 disabled:text-slate-700`,
  secondary: `${buttonBase} border border-slate-500 bg-white text-slate-900 hover:bg-slate-100 focus-visible:ring-blue-700 disabled:bg-slate-100 disabled:text-slate-600`,
  success: `${buttonBase} bg-green-700 text-white hover:bg-green-800 focus-visible:ring-green-700 disabled:bg-slate-300 disabled:text-slate-700`,
  danger: `${buttonBase} bg-red-700 text-white hover:bg-red-800 focus-visible:ring-red-700 disabled:bg-slate-300 disabled:text-slate-700`,
};
