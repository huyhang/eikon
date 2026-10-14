import { NavLink } from 'react-router';
import clsx from 'clsx';
import { Icon } from '../common/Icon';
import { PRIMARY_NAV } from './navigation';
import styles from './TabBar.module.css';

export function TabBar() {
  return (
    <nav className={styles.tabbar} aria-label="Main">
      {PRIMARY_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) => clsx(styles.tab, isActive && styles.active)}
        >
          <Icon name={item.icon} size={24} strokeWidth={1.7} />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
