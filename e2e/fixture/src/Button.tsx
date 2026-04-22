export const Button = ({
  primary = false,
  label,

  theme = 'light',
}: {
  primary?: boolean;
  label: string;
  theme?: string;
}) => {
  const mode = primary ? 'bg-blue-500 text-white' : 'bg-gray-200 text-black';
  const themeClass = theme === 'dark' ? 'dark-mode-override' : '';

  return (
    <button
      type="button"
      className={['button', mode, themeClass].join(' ')}
      style={{
        padding: '10px 20px',
        border: 'none',
        borderRadius: '4px',
        fontSize: '16px',
        cursor: 'pointer',
        backgroundColor: primary ? '#007bff' : '#e0e0e0',
        color: primary ? '#ffffff' : '#333333',
        ...(theme === 'dark' && {
          backgroundColor: primary ? '#0056b3' : '#424242',
          color: '#ffffff',
        }),
      }}
    >
      {label}
    </button>
  );
};
