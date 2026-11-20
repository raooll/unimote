# One downloadable remote definition: protocol + signal data + UI layout.
#
# signal_data shape by protocol (see Catalog::SignalSchema):
#   ir   -> { "commands" => { "POWER" => { "frequency"=>38000, "duty_cycle"=>0.33, "pattern"=>[9000,4500,...] } },
#             "original" => { "POWER" => { "protocol"=>"NEC", "address"=>"04 00 00 00", "command"=>"08 00 00 00" } } }
#   wifi -> { "driver"=>"roku_ecp", "port"=>8060, "commands"=>{ "POWER"=>"PowerToggle", ... } }
#   ble  -> { "service_uuid"=>..., "characteristic_uuid"=>..., "commands"=>{ "POWER_ON"=>"7e00040100..." } }
class RemoteConfig < ApplicationRecord
  PROTOCOLS = %w[ir wifi ble bluetooth_hid].freeze
  STATUSES = %w[draft published archived].freeze

  belongs_to :remote_model, counter_cache: true
  has_many :match_reports, dependent: :destroy
  has_many :saved_remotes, dependent: :nullify

  enum :status, STATUSES.index_with(&:itself), default: "draft", prefix: true

  validates :protocol, inclusion: { in: PROTOCOLS }
  validates :variant, presence: true
  validates :external_id, uniqueness: true, allow_nil: true
  validates :layout_template, inclusion: { in: ->(_) { Catalog::Layouts::KEYS } }, allow_blank: true
  validate :signal_data_valid
  validate { errors.add(:signal_data_json, "is not valid JSON: #{@signal_json_error}") if @signal_json_error }

  before_save :refresh_checksum
  before_save :stamp_published_at

  scope :published, -> { where(status: "published") }
  scope :by_popularity, -> { order(popularity: :desc, id: :asc) }
  scope :for_protocol, ->(p) { p.present? ? where(protocol: p) : all }

  def command_names = (signal_data["commands"] || {}).keys

  # Admin form helper: edit signal_data as pretty-printed JSON.
  def signal_data_json = JSON.pretty_generate(signal_data)

  def signal_data_json=(text)
    @signal_json_error = nil
    self.signal_data = JSON.parse(text.to_s)
  rescue JSON::ParserError => e
    @signal_json_error = e.message.truncate(120)
  end

  # Wilson-ish simple score so a single success doesn't beat 40/50.
  def success_rate
    total = success_count + failure_count
    total.zero? ? nil : (success_count.to_f / total).round(3)
  end

  def bump_version! = increment!(:version)

  private

  def signal_data_valid
    errors.add(:signal_data, "is invalid: #{Catalog::SignalSchema.errors_for(self).first}") if Catalog::SignalSchema.errors_for(self).any?
  end

  def refresh_checksum
    self.checksum = Digest::SHA256.hexdigest(signal_data.to_json)[0, 16] if signal_data_changed? || checksum.blank?
  end

  def stamp_published_at
    self.published_at ||= Time.current if status_published?
  end
end
