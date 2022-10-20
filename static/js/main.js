const api_base = '/api/v1'

const page_constants = {
    ui_name: 'ui_performance',
    backend_name: 'backend_performance',
    test_name_delimiter: '::',
}

var report_formatters = {
    name(value) {
        return value
    },
    start(value, row, index) {
        return new Date(value).toLocaleString()
    },
    status(value, row, index) {
        switch (value.toLowerCase()) {
            case 'error':
                return `<div style="color: var(--red)"><i class="fas fa-exclamation-circle error"></i> ${value}</div>`
            case 'failed':
                return `<div style="color: var(--red)"><i class="fas fa-exclamation-circle error"></i> ${value}</div>`
            case 'success':
                return `<div style="color: var(--green)"><i class="fas fa-exclamation-circle error"></i> ${value}</div>`
            case 'canceled':
                return `<div style="color: var(--gray)"><i class="fas fa-times-circle"></i> ${value}</div>`
            case 'finished':
                return `<div style="color: var(--info)"><i class="fas fa-check-circle"></i> ${value}</div>`
            case 'in progress':
                return `<div style="color: var(--basic)"><i class="fas fa-spinner fa-spin fa-secondary"></i> ${value}</div>`
            case 'post processing':
                return `<div style="color: var(--basic)"><i class="fas fa-spinner fa-spin fa-secondary"></i> ${value}</div>`
            case 'pending...':
                return `<div style="color: var(--basic)"><i class="fas fa-spinner fa-spin fa-secondary"></i> ${value}</div>`
            case 'preparing...':
                return `<div style="color: var(--basic)"><i class="fas fa-spinner fa-spin fa-secondary"></i> ${value}</div>`
            default:
                return value.toLowerCase()
        }
    },
}

const quantile = (arr, percent) => {
    const q = percent > 1 ? percent / 100 : percent
    const asc = arr => arr.sort((a, b) => a - b)
    const sorted = asc(arr)
    const pos = (sorted.length - 1) * q
    const base = Math.floor(pos)
    const rest = pos - base
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base])
    } else {
        return sorted[base]
    }
}

const calculate_time_groups = (start_time, end_time, n_of_groups, iso_format = false) => {
    const start_date = new Date(start_time)
    const end_date = new Date(end_time)
    const period = end_date - start_date
    const synthetic_groups_num = n_of_groups - 1
    if (period === 0 || synthetic_groups_num < 1) {
        return [start_date]
    }
    const group_time_span = Math.ceil(period / synthetic_groups_num)
    const time = start_date.getTime()
    const result = iso_format ? [start_date.toISOString()] : [start_date]
    for (let i = 1; i < synthetic_groups_num; i++) {
        const tmp_date = new Date(time + group_time_span * i)
        result.push(iso_format ? tmp_date.toISOString() : tmp_date)
    }
    result.push(iso_format ? end_date.toISOString() : end_date)
    return result
}

const process_data_slice = (data_slice, name = undefined) => {
    const struct = {
        error_rate: [],
        throughput: [],
        aggregations: {},
        aggregated_tests: data_slice.length,
        start_time: data_slice[data_slice.length - 1]?.start_time,
        name: name
    }
    data_slice.forEach(i => {
        switch (i.group) {
            case page_constants.backend_name:
                struct.error_rate.push(i.metrics.error_rate)
                struct.throughput.push(i.metrics.throughput)
                Object.entries(i.aggregations).forEach(([k, v]) => {
                    if (struct.aggregations[k]) {
                        struct.aggregations[k].push(v)
                    } else {
                        struct.aggregations[k] = [v]
                    }
                })
                break
            case page_constants.ui_name:
                // todo: handle ui test group
                break
            default:
                break
        }
    })
    return struct
}

const group_data_by_timeline = (tests, number_of_groups, name_prefix = 'group') => {
    // we assume that tests are sorted asc by time
    const time_groups = calculate_time_groups(tests.at(0).start_time, tests.at(-1).start_time, number_of_groups)
    // const mutable_tests = Array.from(tests)
    // const test_fits_time_group = (test, time_group) => time_group > new Date(test.start_time)
    let pointers = [0, 0]
    return time_groups.map(time_group => {
        for (let i = pointers[1]; i < tests.length; i++) {
            pointers[1] = i
            if (new Date(tests[i].start_time) > time_group) {
                break
            }
            // time_group > new Date(tests[i].start_time) && pointers[1]++
        }
        const data_slice = tests.slice(...pointers)
        // const group_name = data_slice.length > 1 ?
        //     `${name_prefix} ${pointers[0] + 1}-${pointers[1]}` :
        //     data_slice[0].name
        const struct = process_data_slice(data_slice, time_group)
        struct.start_time = time_group
        pointers[0] = pointers[1]
        return struct
    })
}

const group_data = (tests, number_of_groups, name_prefix = 'group') => {
    let residual = tests.length % number_of_groups
    const group_size = ~~(tests.length / number_of_groups)
    let groups = []
    const pointers = [0, 0]
    while (pointers[1] < tests.length) {
        pointers[1] = pointers[1] + group_size
        if (residual > 0) {
            pointers[1]++ // add extra test to each group if residual > 0
            residual--
        }
        const data_slice = tests.slice(...pointers)
        // const struct = {
        //     error_rate: [],
        //     throughput: [],
        //     aggregations: {},
        //     // ui_metric: {}
        // }
        // data_slice.forEach(i => {
        //     switch (i.group) {
        //         case page_constants.backend_name:
        //             struct.error_rate.push(i.metrics.error_rate)
        //             struct.throughput.push(i.metrics.throughput)
        //             Object.entries(i.aggregations).forEach(([k, v]) => {
        //                 if (struct.aggregations[k]) {
        //                     struct.aggregations[k].push(v)
        //                 } else {
        //                     struct.aggregations[k] = [v]
        //                 }
        //             })
        //             break
        //         case page_constants.ui_name:
        //             // todo: handle ui test group
        //             break
        //         default:
        //             break
        //     }
        // })
        // groups.push({
        //     name: data_slice.length > 1 ?
        //         `${name_prefix} ${pointers[0] + 1}-${pointers[1]}` :
        //         data_slice[0].name,
        //     aggregated_tests: pointers[1] - pointers[0],
        //     start_time: data_slice[data_slice.length - 1].start_time, // take start time from last entry of slice
        //     ...struct
        // })
        const group_name = data_slice.length > 1 ?
            `${name_prefix} ${pointers[0] + 1}-${pointers[1]}` :
            data_slice[0].name
        const struct = process_data_slice(data_slice, group_name)
        groups.push(struct)
        pointers[0] = pointers[1]
    }
    return groups
}

const aggregation_callback_map = {
    min: arr => arr && Math.min(...arr),
    max: arr => arr && Math.max(...arr),
    mean: arr => arr && arr.reduce((a, i) => a + i, 0) / arr.length,
    pct50: arr => arr && quantile(arr, 50),
    pct75: arr => arr && quantile(arr, 75),
    pct90: arr => arr && quantile(arr, 90),
    pct95: arr => arr && quantile(arr, 95),
    pct99: arr => arr && quantile(arr, 99),
}

const aggregate_data = (grouped_data, group_aggregations_key, data_aggregation_type) => {
    const aggregation_callback = aggregation_callback_map[data_aggregation_type] || aggregation_callback_map.mean
    const struct = {
        labels: [],
        aggregated_tests: [],
        names: [],
        throughput: {
            min: [],
            max: [],
            main: []
        },
        error_rate: {
            min: [],
            max: [],
            main: []
        },
        aggregation: {
            min: [],
            max: [],
            main: []
        }
    }
    grouped_data.forEach(group => {
        // O(n)
        const aggregation_data = group.aggregations[group_aggregations_key]
        !aggregation_data && console.warn(
            'No aggregation "', group_aggregations_key, '" for ', group
        )
        struct.labels.push(group.start_time)
        struct.aggregated_tests.push(group.aggregated_tests)
        struct.names.push(group.name)
        struct.throughput.min.push(aggregation_callback_map.min(group.throughput))
        struct.throughput.max.push(aggregation_callback_map.max(group.throughput))
        struct.error_rate.min.push(aggregation_callback_map.min(group.error_rate))
        struct.error_rate.max.push(aggregation_callback_map.max(group.error_rate))

        // following is to apply min-max to selected metric,
        // but we need to apply aggregation_callback to group.aggregations.min and group.aggregations.max
        // struct.aggregation.min.push(aggregation_callback_map.min(aggregation_data))
        // struct.aggregation.max.push(aggregation_callback_map.max(aggregation_data))
        // this will apply aggregation function to metric's min and max aggregated values
        !group.aggregations.min ?
            console.warn('No aggregation "min" for ', group) :
            struct.aggregation.min.push(aggregation_callback(group.aggregations.min))

        !group.aggregations.max ?
            console.warn('No aggregation "max" for ', group) :
            struct.aggregation.max.push(aggregation_callback(group.aggregations.max))
        switch (data_aggregation_type) {
            case 'min':
                struct.throughput.main = struct.throughput.min
                struct.error_rate.main = struct.error_rate.min
                struct.aggregation.main = struct.aggregation.min
                break
            case 'max':
                struct.throughput.main = struct.throughput.max
                struct.error_rate.main = struct.error_rate.max
                struct.aggregation.main = struct.aggregation.max
                break
            default:
                struct.throughput.main.push(aggregation_callback(group.throughput))
                struct.error_rate.main.push(aggregation_callback(group.error_rate))
                struct.aggregation.main.push(aggregation_callback(aggregation_data))
                break
        }
    })
    // console.log('aggregated', struct)
    return struct
}

const change_aggregation_key = (grouped_data, aggregation_type, struct, group_aggregations_key) => {
    // O(n)
    const aggregation_callback = aggregation_callback_map[aggregation_type] || aggregation_callback_map.mean
    grouped_data.forEach(group => {
        const aggregation_data = group.aggregations[group_aggregations_key]
        !aggregation_data && console.warn(
            'No aggregation "', group_aggregations_key, '" data for ', group
        )
        struct.aggregation.min.push(aggregation_callback_map.min(aggregation_data))
        struct.aggregation.max.push(aggregation_callback_map.max(aggregation_data))
        switch (aggregation_type) {
            case 'min':
                struct.aggregation.main = struct.aggregation.min
                break
            case 'max':
                struct.aggregation.main = struct.aggregation.max
                break
            default:
                struct.aggregation.main.push(aggregation_callback(aggregation_data))
                break
        }
    })
    console.log('re-aggregated', struct)
    return struct
}

const get_gradient_max = chart_obj => {
    const {clientHeight} = chart_obj.ctx.canvas
    const gradient = chart_obj.ctx.createLinearGradient(0, 60, 0, clientHeight)
    gradient.addColorStop(0, 'crimson')
    gradient.addColorStop(0.2, 'red')
    gradient.addColorStop(0.8, 'orange')
    gradient.addColorStop(1, 'yellow')
    return gradient
}

const get_gradient_min = chart_obj => {
    const {clientHeight} = chart_obj.ctx.canvas
    const gradient = chart_obj.ctx.createLinearGradient(0, 60, 0, clientHeight)
    gradient.addColorStop(0, 'greenyellow')
    gradient.addColorStop(0.1, 'lightgreen')
    gradient.addColorStop(0.9, 'green')
    gradient.addColorStop(1, 'darkgreen')
    return gradient
}


const dataset_main = (label = '', color = '#5933c6') => ({
    label: label,
    borderColor: color,
    pointBorderColor: color,
    pointBackgroundColor: color,
    pointHoverBackgroundColor: color,
    pointHoverBorderColor: color,
    fill: false,
})

const dataset_max = (label, color) => ({
    ...dataset_main(label, color),
    borderDash: [5, 5],
    borderWidth: 1,
    fill: '+1',
    backgroundColor: '#ff800020',
})

const dataset_min = (label, color) => ({
    ...dataset_main(label, color),
    borderDash: [5, 5],
    borderWidth: 1,
    fill: '-1',
    backgroundColor: '#00800020',
})


const prepare_datasets = (chart_obj, data_node, draw_min_max, dataset_label = '',
                          min_label = 'min', max_label = 'max') => {
    const datasets = []
    draw_min_max && datasets.push({
        ...dataset_max(max_label, get_gradient_max(chart_obj)),
        data: data_node.max
    })
    datasets.push({
        ...dataset_main(dataset_label),
        data: data_node.main,
    })
    draw_min_max && datasets.push({
        ...dataset_min(min_label, get_gradient_min(chart_obj)),
        data: data_node.min
    })
    return datasets
}

const update_chart = (chart_obj, chart_data, chart_options_plugins) => {
    chart_obj.data = chart_data
    Object.assign(chart_obj.options.plugins, chart_options_plugins)
    // chart_obj.options.plugins.tooltip = get_tooltip_options(
    //     this.aggregated_data_backend.aggregated_tests,
    //     this.aggregated_data_backend.names
    // )
    chart_obj.update()
}

const get_tooltip_options = (arr_amounts, arr_names) => ({
    callbacks: {
        footer: tooltip_items => {
            const tests_num = arr_amounts[tooltip_items[0].dataIndex]
            if (tests_num > 1) {
                return `${tests_num} tests aggregated`
            }
        },
        title: tooltip_items => {
            return arr_names[tooltip_items[0].dataIndex]
        },
    }
})

const get_common_chart_options = () => ({
    type: 'line',
    // responsive: true,
    options: {
        // maintainAspectRatio: false,
        // aspectRatio: 2,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        scales: {
            y: {
                type: 'linear',
                title: {
                    display: true,
                },
                grid: {
                    display: false
                },
            },
            x: {
                // type: 'time',
                time: {
                    // unit: 'day',
                    displayFormats: {
                        // day: 'dd MM'
                        day: 'P'
                    },
                    minUnit: 'hour'
                },
                grid: {
                    display: false
                },
                ticks: {
                    display: true,
                    // count: 5,
                    // maxTicksLimit: 6,
                    callback: function (value, index, ticks) {
                        switch (this.type) {
                            case 'category':
                                // return this.getLabelForValue(value)
                                return new Date(this.getLabelForValue(value)).toLocaleDateString()
                            // return new Date(this.getLabelForValue(value)).toLocaleDateString(undefined,
                            //     {day: '2-digit', month: '2-digit'})
                            case 'time':
                            default:
                                return value
                        }
                    }
                }
            }
        },
        plugins: {
            legend: {
                display: false,
            },
            title: {
                display: true,
                align: 'start',
                fullSize: false
            },
        },
    },
})
window.charts = {}

$(() => {
    const get_small_chart_options = () => {
        const opts = get_common_chart_options()
        opts.options.scales.x.ticks.maxTicksLimit = 6
        opts.options.maintainAspectRatio = false
        // opts.options.aspectRatio = 1
        return opts
    }
    let chart_options = get_small_chart_options()
    chart_options.options.scales.y.title.text = 'req/sec'
    chart_options.options.plugins.title.text = 'AVG. THROUGHPUT'
    window.charts.throughput = new Chart('throughput_chart', chart_options)

    chart_options = get_small_chart_options()
    chart_options.options.scales.y.title.text = '%'
    chart_options.options.plugins.title.text = 'ERROR RATE'
    window.charts.error_rate = new Chart('error_rate_chart', chart_options)

    chart_options = get_small_chart_options()
    chart_options.options.scales.y.title.text = 'ms'
    chart_options.options.plugins.title.text = 'RESPONSE TIME'
    window.charts.response_time = new Chart('response_time_chart', chart_options)

    chart_options = get_small_chart_options()
    chart_options.options.scales.y.title.text = 'ms'
    chart_options.options.plugins.title.text = 'PAGE SPEED'
    window.charts.page_speed = new Chart('page_speed_chart', chart_options)
})