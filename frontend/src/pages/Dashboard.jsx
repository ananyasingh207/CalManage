import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCalendar } from '../context/CalendarContext';
import {
  format,
  isSameDay,
  compareAsc,
  startOfToday,
  isAfter,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth as isSameMonthFns,
  isToday as isTodayFns,
  isBefore
} from 'date-fns';
import { Video, MapPin, Clock, ChevronLeft, ChevronRight, FileText, Check, Loader2, ArrowRight, Trash2 } from 'lucide-react';
import { formatTimestamp } from '../utils/formatTimestamp';
import GlassPanel from '../components/UI/GlassPanel';
import HeroWidget from '../components/3D/HeroWidget';
import EventModal from '../components/Modals/EventModal';

const MiniCalendarGrid = ({ currentDate, selectedDate, onDateSelect }) => {
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const rows = [];
  let days = [];
  let day = startDate;

  const today = new Date();

  while (day <= endDate) {
    for (let i = 0; i < 7; i++) {
      const dayCopy = new Date(day); // Capture for closure
      const isSelected = isSameDay(dayCopy, selectedDate);
      const isCurrentMonth = isSameMonthFns(dayCopy, monthStart);
      const isToday = isSameDay(dayCopy, today);
      const dateObj = new Date(dayCopy);

      days.push(
        <button
          key={day.toString()}
          onClick={() => onDateSelect(dayCopy)}
          type="button"
          className={`aspect-square flex items-center justify-center text-xs cursor-pointer rounded-full transition-all relative
            ${!isCurrentMonth ? 'text-gray-600' : 'text-gray-300 hover:bg-white/10 hover:text-white'} 
            ${isSelected ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-bold shadow-lg shadow-blue-500/30' : ''}
          `}
        >
          {format(dateObj, 'd')}
          {isToday && !isSelected && <div className="absolute bottom-1 w-1 h-1 bg-blue-500 rounded-full" />}
        </button>
      );
      day = addDays(day, 1);
    }
    rows.push(
      <div className="grid grid-cols-7 gap-1" key={day.toString()}>
        {days}
      </div>
    );
    days = [];
  }
  return <div className="space-y-1">{rows}</div>;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const { calendars, sharedCalendars, fetchCalendarEvents, visibleCalendarIds, dashboardEvents, setDashboardEvents, selectedDate, setSelectedDate } = useCalendar();

  // Initialize from cache if available
  const [allEventsRaw, setAllEventsRaw] = useState(dashboardEvents || []);
  const [loadingEvents, setLoadingEvents] = useState(!dashboardEvents);

  const [currentDate, setCurrentDate] = useState(new Date());
  const [invites, setInvites] = useState([]);
  const [activities, setActivities] = useState([]);

  // Edit State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [eventToEdit, setEventToEdit] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      try {
        const invitesRes = await fetch('http://localhost:5000/api/shares/invites', { headers: { Authorization: `Bearer ${token}` } });
        if (invitesRes.ok) setInvites(await invitesRes.json());
        const activityRes = await fetch('http://localhost:5000/api/activity', { headers: { Authorization: `Bearer ${token}` } });
        if (activityRes.ok) setActivities(await activityRes.json());
      } catch (error) { console.error(error); }
    };
    fetchData();
  }, [token]);

  useEffect(() => {
    // If we have cache, don't show loader. Just fetch in bg.
    if (dashboardEvents) {
      setAllEventsRaw(dashboardEvents);
      setLoadingEvents(false);
    }

    const loadEvents = async () => {
      const allCals = [...calendars, ...(sharedCalendars || [])];
      if (allCals.length === 0) {
        if (!dashboardEvents) setLoadingEvents(false);
        return;
      }

      if (!dashboardEvents) setLoadingEvents(true);

      let allEvents = [];
      const today = startOfToday();

      // Optimize: Fetch events for processing
      for (const cal of allCals) {
        const events = await fetchCalendarEvents(cal._id);
        const calEvents = events.map(ev => ({
          ...ev,
          color: cal.color,
          calendarName: cal.name,
          calendarId: cal._id,
          creatorName: ev.createdBy?.name,
        }));
        allEvents = [...allEvents, ...calEvents];
      }

      allEvents.sort((a, b) => compareAsc(new Date(a.start), new Date(b.start)));
      setAllEventsRaw(allEvents);
      // Update Cache
      setDashboardEvents(allEvents);
      setLoadingEvents(false);
    };

    if (token) loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calendars, sharedCalendars]); // Removed dashboardEvents/setDashboardEvents to avoid loops

  const todaysEvents = useMemo(() => {
    return allEventsRaw.filter(ev =>
      visibleCalendarIds.has(ev.calendarId) &&
      isSameDay(new Date(ev.start), selectedDate)
    );
  }, [allEventsRaw, visibleCalendarIds, selectedDate]);

  const now = new Date();
  // If selectedDate is NOT today, show all events for that day as if it's the start of the day
  // If selectedDate IS today, we can separate past/future if desired, but "Up Next" usually implies future.
  // For simplicity: If not today, treat "Up Next" as first event of day.
  const isTodayDate = isSameDay(selectedDate, new Date());

  const isPastDate = isBefore(selectedDate, startOfToday());

  const timedEvents = todaysEvents.filter(ev => !ev.allDay);
  const allDayEvents = todaysEvents.filter(ev => ev.allDay);

  const upNextIndex = timedEvents.findIndex(ev => {
    if (isPastDate) return false;
    if (isTodayDate) return isAfter(new Date(ev.end), now);
    return true; // If not today and not past, show first event as "next"
  });

  const upNext = upNextIndex !== -1 ? timedEvents[upNextIndex] : null;
  const remainingTimedEvents = upNextIndex !== -1 ? timedEvents.slice(upNextIndex + 1) : [];

  const restOfToday = isPastDate ? [] : [...allDayEvents, ...remainingTimedEvents];

  let pastEvents = [];
  if (isPastDate) {
    pastEvents = [...allDayEvents, ...timedEvents];
  } else if (isTodayDate) {
    pastEvents = upNextIndex === -1 ? [...timedEvents] : timedEvents.slice(0, upNextIndex);
  }

  const handleReschedule = (event) => {
    setEventToEdit(event);
    setIsModalOpen(true);
  };

  const handleJoinMeeting = (link) => {
    if (link) window.open(link, '_blank');
  };

  const respondToInvite = async (id, status) => {
    try {
      await fetch(`http://localhost:5000/api/shares/invites/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status })
      });
      setInvites(invites.filter(i => i._id !== id));
    } catch (error) { console.error(error); }
  };

  if (loadingEvents && calendars.length > 0 && !dashboardEvents) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left Column */}
      <div className="lg:col-span-2 space-y-8">
        {/* Welcome & Time */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <GlassPanel className="p-8 flex flex-col justify-center relative overflow-hidden group">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-blue-500/20 rounded-full blur-3xl group-hover:bg-blue-500/30 transition-all duration-700" />
            <h2 className="text-3xl font-bold text-white mb-2 relative z-10">
              Good Morning,<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">
                {user?.name?.split(' ')[0]}
              </span>
            </h2>
            <p className="text-gray-400 relative z-10">
              You have <span className="text-white font-semibold">{timedEvents.length}</span> meetings scheduled for {isSameDay(selectedDate, new Date()) ? 'today' : format(selectedDate, 'MMMM do')}.
            </p>
            <div className="mt-6 flex items-center gap-3 relative z-10">
              <button onClick={() => navigate('/calendar')} className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-all backdrop-blur-md border border-white/5">
                View Calendar
              </button>
              <button onClick={() => { setEventToEdit(null); setIsModalOpen(true); }} className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-blue-500/20">
                Add Event
              </button>
            </div>
          </GlassPanel>

          <GlassPanel className="relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-indigo-900/40 to-purple-900/40 border-indigo-500/20">
            <div className="absolute inset-0 z-0">
              <HeroWidget />
            </div>
            <div className="relative z-10 text-center pointer-events-none">
              <div className="text-sm font-medium text-indigo-200 tracking-wider uppercase mb-1">Current Time</div>
              <div className="text-4xl font-bold text-white tracking-tight">
                {format(new Date(), 'h:mm a')}
              </div>
            </div>
          </GlassPanel>
        </div>

        {/* Up Next */}
        {!isPastDate && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-widest pl-1">Up Next</h3>
            <GlassPanel className="overflow-hidden border-l-4 border-l-blue-500">
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                <span className="text-xs font-medium text-blue-300 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20">
                  {isTodayDate ? 'HAPPENING SOON' : 'UPCOMING'}
                </span>
                {upNext && upNext.isMeeting && <Video className="w-5 h-5 text-gray-400 hover:text-white cursor-pointer transition-colors" />}
              </div>

              <div className="p-8">
                {upNext ? (
                  <>
                    <h3 className="text-2xl font-bold text-white mb-4">{upNext.title}</h3>
                    <div className="flex flex-wrap gap-6 text-sm text-gray-400 mb-8">
                      <div className="flex items-center">
                        <Clock className="w-4 h-4 mr-2 text-indigo-400" />
                        <span className="text-gray-300">{formatTimestamp(upNext.start)} - {formatTimestamp(upNext.end)}</span>
                      </div>
                      <div className="flex items-center">
                        <MapPin className="w-4 h-4 mr-2 text-indigo-400" />
                        <span className="text-gray-300">{upNext.location || (upNext.isMeeting ? upNext.meetingPlatform || 'Online' : 'No Location')}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex -space-x-2">
                        {/* Placeholder avatars if no actual attendees displayed yet */}
                        <div className="w-8 h-8 rounded-full border-2 border-black bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
                          {user?.name?.[0]}
                        </div>
                      </div>
                      <div className="space-x-3">
                        <button onClick={() => handleReschedule(upNext)} className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors">
                          Reschedule
                        </button>
                        {upNext.isMeeting ? (
                          <button onClick={() => handleJoinMeeting(upNext.meetingLink)} className={`px-5 py-2 text-sm font-medium text-white rounded-lg shadow-lg transition-all ${!upNext.meetingLink ? 'bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/25'}`} disabled={!upNext.meetingLink}>
                            Join Meeting
                          </button>
                        ) : (
                          <button onClick={() => handleReschedule(upNext)} className="px-5 py-2 text-sm font-medium text-white bg-gray-700 rounded-lg hover:bg-gray-600 border border-white/10 transition-all">
                            View Details
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {isTodayDate ? "No upcoming events for today. Relax and recharge! ☕" : "No events scheduled for this day."}
                  </div>
                )}
              </div>
            </GlassPanel>
          </div>
        )}

        {/* Rest of Today / Day's List */}
        {!isPastDate && (
          <div>
            <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-widest mb-4 pl-1">
              {isTodayDate ? 'Rest of Today' : `Events for ${format(selectedDate, 'MMM d')}`}
            </h3>
            <div className="space-y-4">
              {restOfToday.length > 0 ? (
                restOfToday.map(event => (
                  <GlassPanel key={event._id} hoverEffect className={`p-5 flex items-center group cursor-pointer ${event.allDay ? 'border-l-4 border-l-amber-500' : ''}`} onClick={() => handleReschedule(event)}>
                    {event.allDay ? (
                      <>
                        <div className="w-24 flex-shrink-0 text-right pr-6 border-r border-white/10 mr-6">
                          <p className="text-xs font-bold text-amber-400 uppercase">All Day</p>
                        </div>
                        <div className="flex-1">
                          <h4 className="text-base font-semibold text-gray-200 group-hover:text-amber-400 transition-colors">{event.title}</h4>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-24 flex-shrink-0 text-right pr-6 border-r border-white/10 mr-6">
                          <p className="text-sm font-bold text-white">{formatTimestamp(event.start)}</p>
                          <p className="text-xs text-gray-500">{formatTimestamp(event.end)}</p>
                        </div>
                        <div className="flex-1">
                          <h4 className="text-base font-semibold text-gray-200 group-hover:text-blue-400 transition-colors">{event.title}</h4>
                        </div>
                      </>
                    )}
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <button className="p-2 hover:bg-white/10 rounded-full text-gray-400 hover:text-white">
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </GlassPanel>
                ))
              ) : (
                <div className="p-8 text-center border border-white/5 rounded-xl border-dashed">
                  <p className="text-gray-500 text-sm">No more events scheduled.</p>
                </div>
              )}
            </div>
          </div>

        )}

        {/* Past Events */}
        {pastEvents.length > 0 && (
          <div className="opacity-60 grayscale-[50%] hover:opacity-100 hover:grayscale-0 transition-all duration-300">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4 pl-1">
              {isTodayDate ? 'Earlier Today' : 'Past Events'}
            </h3>
            <div className="space-y-4">
              {pastEvents.map(event => (
                <GlassPanel key={event._id} className={`p-5 flex items-center group cursor-default ${event.allDay ? 'border-l-4 border-l-gray-600' : ''}`}>
                  {event.allDay ? (
                    <>
                      <div className="w-24 flex-shrink-0 text-right pr-6 border-r border-white/10 mr-6">
                        <p className="text-xs font-bold text-gray-500 uppercase">All Day</p>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base font-semibold text-gray-400">{event.title}</h4>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-24 flex-shrink-0 text-right pr-6 border-r border-white/10 mr-6">
                        <p className="text-sm font-bold text-gray-400">{formatTimestamp(event.start)}</p>
                        <p className="text-xs text-gray-600">{formatTimestamp(event.end)}</p>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-base font-semibold text-gray-400">{event.title}</h4>
                      </div>
                    </>
                  )}
                </GlassPanel>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Column */}
      <div className="space-y-8">
        <GlassPanel className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-white">{format(currentDate, 'MMMM yyyy')}</h3>
            <div className="flex space-x-1">
              <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))} className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] uppercase font-bold tracking-wider mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => <div key={d} className="text-indigo-300/50 py-1">{d}</div>)}
          </div>
          <MiniCalendarGrid
            currentDate={currentDate}
            selectedDate={selectedDate}
            onDateSelect={(date) => {
              setSelectedDate(date);
              // Auto-switch mini calendar view if picking date from prev/next month (handled by grid loop but nice to have)
            }}
          />
        </GlassPanel>

        <GlassPanel className="p-6">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex justify-between items-center">
            Pending Invites
            {invites.length > 0 && <span className="bg-blue-500 text-white py-0.5 px-2 rounded-full text-[10px]">{invites.length}</span>}
          </h3>
          <div className="space-y-4">
            {invites.length > 0 ? invites.map(invite => (
              <div key={invite._id} className="pb-4 border-b border-white/5 last:border-0 last:pb-0">
                <p className="font-semibold text-sm text-gray-200">{invite.calendar?.name}</p>
                <p className="text-xs text-gray-500 mt-1">Invited by <span className="text-indigo-300">{invite.calendar?.user?.name}</span></p>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => respondToInvite(invite._id, 'accepted')} className="flex-1 py-1.5 bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-medium rounded hover:bg-blue-600/30">Accept</button>
                  <button onClick={() => respondToInvite(invite._id, 'declined')} className="flex-1 py-1.5 bg-white/5 border border-white/10 text-gray-400 text-xs font-medium rounded hover:bg-white/10">Decline</button>
                </div>
              </div>
            )) : <p className="text-sm text-gray-500 italic">No pending invitations.</p>}
          </div>
        </GlassPanel>

        <GlassPanel className="p-6">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">Recent Activity</h3>
          <div className="space-y-4">
            {activities.length > 0 ? activities.map(activity => (
              <div key={activity._id} className="flex items-start space-x-3 group">
                <div className={`mt-0.5 p-1.5 rounded-lg bg-white/5 text-gray-400`}>
                  <FileText className="w-3 h-3" />
                </div>
                <div>
                  <p className="text-sm text-gray-300 group-hover:text-white transition-colors">{activity.details}</p>
                  <p className="text-[10px] text-gray-600 mt-1">{formatTimestamp(activity.createdAt)}</p>
                </div>
              </div>
            )) : <p className="text-sm text-gray-500 italic">No recent activity.</p>}
          </div>
        </GlassPanel>
      </div>

      <EventModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEventToEdit(null); }}
        eventToEdit={eventToEdit}
        selectedDate={selectedDate} // Pass selected date to create event with correct date
      />
    </div>
  );
};

export default Dashboard;
