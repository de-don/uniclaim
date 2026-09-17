import { ConnectButton } from '@rainbow-me/rainbowkit'

const STEPS = [
  {
    title: 'Подключите кошелёк',
    text: 'Ничего не подписываете — подключение нужно только чтобы узнать адрес.',
  },
  {
    title: 'Мы сканируем все сети',
    text: 'Читаем ваши Uniswap V3 позиции напрямую из контрактов в 9 сетях и считаем накопленные комиссии.',
  },
  {
    title: 'Собираете одной транзакцией',
    text: 'Все выбранные позиции одной сети пакуются в один multicall — одна подпись, одна комиссия за газ.',
  },
]

export function Landing() {
  return (
    <div className="landing">
      <h1 className="landing__title">
        Соберите комиссии со <span className="accent">всех позиций</span> одной транзакцией
      </h1>
      <p className="landing__lede">
        UniClaim находит все ваши Uniswap V3 позиции, показывает накопленные, но не забранные
        комиссии, и собирает их пакетом — по одной транзакции на сеть вместо одной на позицию.
      </p>

      <ol className="steps">
        {STEPS.map((step, i) => (
          <li key={step.title} className="step">
            <span className="step__num">{i + 1}</span>
            <div>
              <h3 className="step__title">{step.title}</h3>
              <p className="step__text">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="landing__cta">
        <ConnectButton />
      </div>

      <p className="landing__note">
        Приложение полностью клиентское: нет бэкенда, нет аналитики, нет хранения ключей. Комиссии
        всегда уходят на ваш собственный адрес — контракт Uniswap не позволяет отправить их куда-то
        ещё.
      </p>
    </div>
  )
}
