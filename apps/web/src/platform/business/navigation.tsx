import { businessUi } from '../business-copy';
import { useId } from 'react';
import { Link, useNavigate } from 'react-router';
import { AppIcon } from '@orkobi/sdk-ui';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import type { BusinessDefinition, BusinessEntity } from '@orkobi/contracts';
import { usePreferences } from '../../preferences-context';
import { useBusinessWorkspace } from './workspace-context';
export function BusinessNavigation({
  definition,
  entity,
  detail,
}: {
  definition: BusinessDefinition;
  entity: BusinessEntity | undefined;
  detail: boolean;
}) {
  const { locale } = usePreferences(),
    { definitions } = useBusinessWorkspace(),
    navigate = useNavigate(),
    id = useId();
  return (
    <>
      <div className="business-context-bar">
        <Link to="/modules" className="business-back">
          <ArrowLeft size={16} />
          Modules
        </Link>
        <label className="business-module-switch" htmlFor={id}>
          <span className="sr-only">{businessUi.switchModule[locale]}</span>
          <AppIcon name={definition.icon} size={18} />
          <select
            id={id}
            value={definition.key}
            onChange={(event) => navigate(`/business/${event.target.value}`)}
          >
            {definitions.map((item) => (
              <option key={item.key} value={item.key}>
                {item.label[locale]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {definition.entities.length > 1 && (
        <nav className="business-entity-nav" aria-label={definition.label[locale]}>
          {definition.entities.map((item) => (
            <Link
              key={item.key}
              to={`/business/${definition.key}/${item.key}`}
              className={entity?.key === item.key ? 'active' : ''}
              aria-current={entity?.key === item.key ? 'page' : undefined}
            >
              {item.label[locale]}
            </Link>
          ))}
        </nav>
      )}
      {detail && entity && (
        <div className="business-breadcrumb">
          <Link to={`/business/${definition.key}/${entity.key}`}>{entity.label[locale]}</Link>
          <ChevronRight size={14} aria-hidden="true" />
          <span>{businessUi.record[locale]}</span>
        </div>
      )}
    </>
  );
}
