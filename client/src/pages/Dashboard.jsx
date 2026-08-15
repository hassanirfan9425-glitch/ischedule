import DashboardClassic from './DashboardClassic.jsx';
import DashboardTechnical from './DashboardTechnical.jsx';
import DashboardOrbit from './DashboardOrbit.jsx';

export default function Dashboard(props) {
  if (props.user?.uiStyle === 'technical') return <DashboardTechnical {...props} />;
  if (props.user?.uiStyle === 'orbit') return <DashboardOrbit {...props} />;
  return <DashboardClassic {...props} />;
}
