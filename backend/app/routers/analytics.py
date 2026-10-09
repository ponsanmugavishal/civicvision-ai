from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from ..auth import DB, OptionalUser, StaffOrAbove
from ..filters import ReportFilters, report_filters
from ..models import Report
from ..permissions import routing_map, scope_query
from ..services import analytics
from .. import schemas as S

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _reports(db, user, f: ReportFilters) -> list[Report]:
    routing = routing_map(db)
    stmt = select(Report)
    if user is not None:  # citizens see their own; staff/supervisors their scope; anonymous callers all (public aggregates)
        stmt = scope_query(stmt, user, routing)
    return f.post_filter(list(db.scalars(f.apply(stmt, routing)).all()))


@router.get("/summary", response_model=S.SummaryStatsOut)
def summary(user: OptionalUser, db: DB, f: Annotated[ReportFilters, Depends(report_filters)]):
    return analytics.summarize(db, _reports(db, user, f))


@router.get("/hotspots", response_model=list[S.HotspotOut])
def hotspots(user: OptionalUser, db: DB, f: Annotated[ReportFilters, Depends(report_filters)]):
    return analytics.hotspots(_reports(db, user, f))


@router.get("/departments", response_model=list[S.DepartmentStatsOut])
def departments(user: StaffOrAbove, db: DB, f: Annotated[ReportFilters, Depends(report_filters)]):
    return analytics.departments(db, _reports(db, user, f), routing_map(db))


@router.get("/trend", response_model=list[S.TrendPointOut])
def trend(user: StaffOrAbove, db: DB, f: Annotated[ReportFilters, Depends(report_filters)], weeks: int = Query(default=10, ge=1, le=52)):
    return analytics.trend(_reports(db, user, f), weeks)
