import DashboardClassic from './DashboardClassic.jsx';
import DashboardTechnical from './DashboardTechnical.jsx';

export default function Dashboard(props) {
  if (props.user?.uiStyle === 'technical') return <DashboardTechnical {...props} />;
  return <DashboardClassic {...props} />;
}
